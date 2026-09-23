import { Injectable } from "@nestjs/common";
import type { Prisma, RegistrationField } from "@prisma/client";
import { PAGINATION } from "@kiro/config";
import type { CursorPage } from "@kiro/types";
import { PrismaService } from "../prisma/prisma.service";
import { ApiException } from "../common/exceptions/api.exception";
import { ForbiddenActionException, ResourceNotFoundException } from "../common/exceptions/common-exceptions";
import { ACTIVE_REGISTRATION_STATUSES as ACTIVE_STATUSES } from "../common/constants/registration-active-statuses";
import { NotificationsService } from "../notifications/notifications.service";
import { EventAccessService } from "../organizer/event-access.service";
import type { CreateRegistrationDto, RegistrationAnswerDto } from "./dto/create-registration.dto";
import type { ListRegistrationsDto } from "./dto/list-registrations.dto";
import type { RejectRegistrationDto } from "./dto/reject-registration.dto";
import type { SetRegistrationFieldsDto } from "./dto/set-registration-fields.dto";

const REGISTRATION_INCLUDE = {
  answers: { include: { field: true } },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly eventAccess: EventAccessService,
  ) {}

  /**
   * §26/§27 — creates or re-activates (after a prior cancel/reject) a
   * registration. Locked per-event (`pg_advisory_xact_lock`, same technique
   * as the credits ledger's per-user lock) so two concurrent registrations
   * can't both read "1 spot left" and both take it.
   */
  async register(eventId: string, userId: string, dto: CreateRegistrationDto) {
    const registration = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;

      const event = await tx.event.findUnique({
        where: { id: eventId },
        include: { registrationFields: true },
      });
      if (!event) throw new ResourceNotFoundException("Event not found");
      this.assertRegistrationOpen(event);

      const existing = await tx.registration.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (existing && ACTIVE_STATUSES.includes(existing.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new ApiException("ALREADY_REGISTERED", "Already registered for this event", 409);
      }
      if (existing?.status === "WAITLISTED") {
        throw new ApiException("ALREADY_REGISTERED", "Already on the waitlist for this event", 409);
      }

      this.validateAnswers(event.registrationFields, dto.answers ?? []);

      const activeCount = await tx.registration.count({
        where: { eventId, status: { in: [...ACTIVE_STATUSES] } },
      });
      const capacityReached = event.capacity != null && activeCount >= event.capacity;

      let status: (typeof ACTIVE_STATUSES)[number] | "WAITLISTED";
      if (capacityReached) {
        if (!dto.joinWaitlist) {
          throw new ApiException("EVENT_CAPACITY_REACHED", "This event is fully booked", 409);
        }
        status = "WAITLISTED";
      } else {
        status = this.initialStatus(event.approvalMode);
      }

      const data: Prisma.RegistrationUncheckedCreateInput = {
        eventId,
        userId,
        status,
        showAsParticipant: dto.showAsParticipant ?? false,
      };

      const registration = existing
        ? await tx.registration.update({
            where: { id: existing.id },
            data: { ...data, cancelledAt: null, rejectedAt: null, approvedAt: null },
          })
        : await tx.registration.create({ data });

      await tx.registrationAnswer.deleteMany({ where: { registrationId: registration.id } });
      if (dto.answers?.length) {
        await tx.registrationAnswer.createMany({
          data: dto.answers.map((a) => ({
            registrationId: registration.id,
            fieldId: a.fieldId,
            valueJson: a.value as Prisma.InputJsonValue,
          })),
        });
      }

      return tx.registration.findUniqueOrThrow({
        where: { id: registration.id },
        include: REGISTRATION_INCLUDE,
      });
    });

    // Fired after the transaction commits, not inside it — a mid-transaction
    // notification write uses a separate connection and wouldn't roll back
    // if the transaction later failed.
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { ownerId: true, title: true } });
    if (event) {
      await this.notifications.create({
        userId: event.ownerId,
        type: "REGISTRATION_RECEIVED",
        title: "New registration",
        body: `Someone just registered for "${event.title}".`,
        payloadJson: { eventId, registrationId: registration.id },
      });
    }

    return registration;
  }

  /** Attendee cancels their own registration; a freed active slot promotes the oldest waitlisted registrant. */
  async cancel(registrationId: string, userId: string) {
    const { updated, promoted } = await this.prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({ where: { id: registrationId } });
      if (!registration) throw new ResourceNotFoundException("Registration not found");
      if (registration.userId !== userId) throw new ForbiddenActionException();
      if (registration.status === "CANCELLED") return { updated: registration, promoted: null };

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registration.eventId}))`;

      const wasActive = ACTIVE_STATUSES.includes(registration.status as (typeof ACTIVE_STATUSES)[number]);
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });

      const promoted = wasActive ? await this.promoteFromWaitlist(tx, registration.eventId) : null;
      return { updated, promoted };
    });

    if (promoted) await this.notifyWaitlistPromoted(promoted);
    return updated;
  }

  /** Organizer approves a PENDING registration (§27 — free+approval or paid+approval flow). */
  async approve(eventId: string, registrationId: string, organizerId: string) {
    const registration = await this.getOwnedRegistration(eventId, registrationId, organizerId);
    if (registration.status !== "PENDING") {
      throw new ApiException("VALIDATION_ERROR", "Only a pending registration can be approved", 400);
    }
    const updated = await this.prisma.registration.update({
      where: { id: registrationId },
      data: { status: "REGISTERED", approvedAt: new Date() },
    });
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
    await this.notifications.create({
      userId: updated.userId,
      type: "REGISTRATION_APPROVED",
      title: "You're in!",
      body: `Your registration for "${event?.title ?? ""}" was approved.`,
      payloadJson: { eventId, registrationId },
    });
    return updated;
  }

  /** Organizer rejects a PENDING registration; frees the capacity slot it reserved. */
  async reject(eventId: string, registrationId: string, organizerId: string, dto: RejectRegistrationDto) {
    const { updated, promoted } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
      const registration = await this.getOwnedRegistration(eventId, registrationId, organizerId, tx);
      if (registration.status !== "PENDING") {
        throw new ApiException("VALIDATION_ERROR", "Only a pending registration can be rejected", 400);
      }
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: { status: "REJECTED", rejectedAt: new Date(), organizerPrivateNote: dto.note },
      });
      const promoted = await this.promoteFromWaitlist(tx, eventId);
      return { updated, promoted };
    });

    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
    await this.notifications.create({
      userId: updated.userId,
      type: "REGISTRATION_REJECTED",
      title: "Registration update",
      body: `Your registration for "${event?.title ?? ""}" wasn't approved.`,
      payloadJson: { eventId, registrationId },
    });
    if (promoted) await this.notifyWaitlistPromoted(promoted);
    return updated;
  }

  /** Attendee claims they've sent payment (UX §13's "Я оплатив"), for a paid event's REGISTERED registration. */
  async markPaid(registrationId: string, userId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { event: true },
    });
    if (!registration) throw new ResourceNotFoundException("Registration not found");
    if (registration.userId !== userId) throw new ForbiddenActionException();
    if (registration.event.priceType !== "PAID") {
      throw new ApiException("VALIDATION_ERROR", "This event is free — nothing to pay", 400);
    }
    if (registration.status !== "REGISTERED") {
      throw new ApiException("VALIDATION_ERROR", "Only a registered attendee can mark payment as sent", 400);
    }
    const updated = await this.prisma.registration.update({
      where: { id: registrationId },
      data: { status: "PAYMENT_PENDING", paymentClickedAt: new Date() },
    });
    // Notifies the organizer a payment is awaiting their confirmation, not the payer.
    await this.notifications.create({
      userId: registration.event.ownerId,
      type: "PAYMENT_PENDING",
      title: "Payment sent",
      body: `A participant marked their payment as sent for "${registration.event.title}".`,
      payloadJson: { eventId: registration.eventId, registrationId },
    });
    return updated;
  }

  /** Organizer confirms they received payment (UX §13). */
  async confirmPayment(eventId: string, registrationId: string, organizerId: string) {
    const registration = await this.getOwnedRegistration(eventId, registrationId, organizerId);
    if (registration.status !== "PAYMENT_PENDING") {
      throw new ApiException("VALIDATION_ERROR", "Only a payment-pending registration can be confirmed", 400);
    }
    const updated = await this.prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CONFIRMED", paymentConfirmedAt: new Date() },
    });
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
    await this.notifications.create({
      userId: updated.userId,
      type: "PAYMENT_CONFIRMED",
      title: "Payment confirmed",
      body: `Your payment for "${event?.title ?? ""}" was confirmed. See you there!`,
      payloadJson: { eventId, registrationId },
    });
    return updated;
  }

  private async notifyWaitlistPromoted(promoted: { id: string; userId: string; eventId: string }): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: promoted.eventId }, select: { title: true } });
    await this.notifications.create({
      userId: promoted.userId,
      type: "WAITLIST_SPOT_OPENED",
      title: "A spot opened up!",
      body: `A spot opened up for "${event?.title ?? ""}" — you're in.`,
      payloadJson: { eventId: promoted.eventId, registrationId: promoted.id },
    });
  }

  /** The caller's own registration for one specific event, if any — lets the event page render the right CTA state. */
  async getMine(eventId: string, userId: string) {
    return this.prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      include: REGISTRATION_INCLUDE,
    });
  }

  /** Organizer/co-organizer view of everyone registered for their event (§83). */
  async listForEvent(
    eventId: string,
    organizerId: string,
    query: ListRegistrationsDto,
  ): Promise<CursorPage<unknown>> {
    await this.eventAccess.assertPermission(eventId, organizerId, "MANAGE_REGISTRATIONS");

    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const registrations = await this.prisma.registration.findMany({
      where: { eventId, status: query.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        ...REGISTRATION_INCLUDE,
        user: { select: { id: true, name: true, nickname: true, email: true, phone: true, avatarUrl: true } },
      },
    });

    const hasMore = registrations.length > limit;
    const items = hasMore ? registrations.slice(0, limit) : registrations;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  /** "Мої" — the caller's own registrations across every event. */
  async listMine(userId: string, query: ListRegistrationsDto): Promise<CursorPage<unknown>> {
    const limit = Math.min(query.limit ?? PAGINATION.defaultLimit, PAGINATION.maxLimit);
    const registrations = await this.prisma.registration.findMany({
      where: { userId, status: query.status },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        ...REGISTRATION_INCLUDE,
        event: { include: { media: { orderBy: { sortOrder: "asc" }, take: 1 }, category: true, city: true, district: true } },
      },
    });

    const hasMore = registrations.length > limit;
    const items = hasMore ? registrations.slice(0, limit) : registrations;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, hasMore };
  }

  /** §25 — organizer replaces the whole custom-question set in one call. */
  async setFields(eventId: string, organizerId: string, dto: SetRegistrationFieldsDto): Promise<RegistrationField[]> {
    await this.eventAccess.assertPermission(eventId, organizerId, "EDIT_EVENT");

    return this.prisma.$transaction(async (tx) => {
      const keepIds = dto.fields.filter((f) => f.id).map((f) => f.id!);
      await tx.registrationField.deleteMany({ where: { eventId, id: { notIn: keepIds } } });
      return Promise.all(
        dto.fields.map((f) =>
          f.id
            ? tx.registrationField.update({
                where: { id: f.id },
                data: {
                  label: f.label,
                  type: f.type,
                  required: f.required ?? false,
                  optionsJson: f.options as Prisma.InputJsonValue,
                  sortOrder: f.sortOrder,
                },
              })
            : tx.registrationField.create({
                data: {
                  eventId,
                  label: f.label,
                  type: f.type,
                  required: f.required ?? false,
                  optionsJson: f.options as Prisma.InputJsonValue,
                  sortOrder: f.sortOrder,
                },
              }),
        ),
      );
    });
  }

  private initialStatus(approvalMode: string): (typeof ACTIVE_STATUSES)[number] {
    return approvalMode === "ORGANIZER_APPROVAL" ? "PENDING" : "REGISTERED";
  }

  private assertRegistrationOpen(event: {
    status: string;
    registrationDeadline: Date | null;
  }): void {
    if (event.status === "CANCELLED") {
      throw new ApiException("REGISTRATION_CLOSED", "This event has been cancelled", 400);
    }
    if (event.status !== "PUBLISHED") {
      throw new ApiException("REGISTRATION_CLOSED", "This event isn't open for registration", 400);
    }
    if (event.registrationDeadline && event.registrationDeadline.getTime() < Date.now()) {
      throw new ApiException("REGISTRATION_CLOSED", "The registration deadline has passed", 400);
    }
  }

  /** §28 — required fields must be answered; SELECT/MULTISELECT values must be one of the configured options. */
  private validateAnswers(fields: RegistrationField[], answers: RegistrationAnswerDto[]): void {
    const answerByField = new Map(answers.map((a) => [a.fieldId, a.value]));
    const errors: Record<string, string[]> = {};

    for (const field of fields) {
      const value = answerByField.get(field.id);
      const isEmpty = value === undefined || value === null || value === "";
      if (field.required && isEmpty) {
        errors[field.id] = ["This field is required"];
        continue;
      }
      if (isEmpty) continue;

      const options = (field.optionsJson as string[] | null) ?? undefined;
      if (field.type === "SELECT" && options && !options.includes(String(value))) {
        errors[field.id] = ["Not a valid option"];
      }
      if (field.type === "MULTISELECT" && options) {
        const values = Array.isArray(value) ? value : [value];
        if (values.some((v) => !options.includes(String(v)))) {
          errors[field.id] = ["Not a valid option"];
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ApiException("VALIDATION_ERROR", "Invalid registration answers", 400, errors);
    }
  }

  /**
   * Promotes the longest-waiting WAITLISTED registration into the normal
   * flow after a slot frees up (UX §16). Returns who got promoted so the
   * caller can notify them once the transaction has actually committed.
   */
  private async promoteFromWaitlist(
    tx: Prisma.TransactionClient,
    eventId: string,
  ): Promise<{ id: string; userId: string; eventId: string } | null> {
    const event = await tx.event.findUnique({ where: { id: eventId }, select: { capacity: true, approvalMode: true } });
    if (!event?.capacity) return null;

    const activeCount = await tx.registration.count({
      where: { eventId, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (activeCount >= event.capacity) return null;

    const next = await tx.registration.findFirst({
      where: { eventId, status: "WAITLISTED" },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    await tx.registration.update({
      where: { id: next.id },
      data: { status: this.initialStatus(event.approvalMode) },
    });
    return { id: next.id, userId: next.userId, eventId };
  }

  private async getOwnedRegistration(
    eventId: string,
    registrationId: string,
    organizerId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const registration = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!registration || registration.eventId !== eventId) {
      throw new ResourceNotFoundException("Registration not found");
    }
    // Permission check runs against the outer connection, not `tx` — fine
    // for a read-only authorization check even when called mid-transaction.
    await this.eventAccess.assertPermission(eventId, organizerId, "MANAGE_REGISTRATIONS");
    return registration;
  }
}
