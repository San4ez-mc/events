import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { PrismaService } from "../../src/prisma/prisma.service";
import type { EnvConfig } from "../../src/config/env.validation";

/** Shared prefix for every QA (auditor "events" area) test file — used both for unique emails and afterAll cleanup. */
export const QA_PREFIX = "qa-ev-";

export async function bootstrapApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, app.get(ConfigService<EnvConfig, true>));
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

let counter = 0;
function uniqueEmail(label: string): string {
  counter += 1;
  return `${QA_PREFIX}${label}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2)}@example.com`;
}

export async function newUser(
  app: INestApplication,
  label: string,
): Promise<{ token: string; id: string; email: string }> {
  const email = uniqueEmail(label);
  const res = await http(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "Str0ngPass1!", name: `${label} QA` })
    .expect(201);
  return { token: res.body.accessToken, id: res.body.user.id, email };
}

/** Creates a DRAFT event owned by `token`, claiming a free listing credit first (needed to publish later). */
export async function createDraftEvent(
  app: INestApplication,
  token: string,
  title = "QA Fixture Event",
): Promise<string> {
  await http(app).post("/api/v1/credits/claim-free").set("Authorization", `Bearer ${token}`);
  const res = await http(app)
    .post("/api/v1/events")
    .set("Authorization", `Bearer ${token}`)
    .send({ title })
    .expect(201);
  return res.body.id as string;
}

export interface PublishOverrides {
  approvalMode?: "AUTO" | "ORGANIZER_APPROVAL";
  priceType?: "FREE" | "PAID";
  price?: number;
  capacity?: number;
  minParticipants?: number;
  visibility?: "PUBLIC" | "PRIVATE";
  registrationDeadline?: string;
  paymentUrl?: string;
  startsAt?: string;
  format?: "OFFLINE" | "ONLINE";
  onlineUrl?: string;
  title?: string;
}

/**
 * A wide, jittered future offset — NOT the usual "+7 days" — so that this
 * event's `startsAt` is very unlikely to collide with another parallel
 * auditor's (or another test in this same suite's) events. Discovery-feed
 * presence/absence assertions bracket `dateFrom`/`dateTo` tightly around
 * this exact instant instead of paging through a shared, concurrently
 * written events table (see qa-helpers.ts's doc comment on
 * `feedDateBracket`).
 */
function jitteredFutureDate(): Date {
  const days = 200 + Math.random() * 500;
  return new Date(Date.now() + days * 86_400_000);
}

/** A tight [dateFrom, dateTo] query-param pair bracketing one event's own startsAt, safe to use in a shared/concurrent DB. */
export function feedDateBracket(startsAtIso: string): { dateFrom: string; dateTo: string } {
  const t = new Date(startsAtIso).getTime();
  return { dateFrom: new Date(t - 60_000).toISOString(), dateTo: new Date(t + 60_000).toISOString() };
}

/** Creates + patches + publishes an event in one call, returning ids/tokens/slug needed by most tests. */
export async function createPublishedEvent(
  app: INestApplication,
  categoryId: string,
  cityId: string,
  overrides: PublishOverrides = {},
): Promise<{ eventId: string; slug: string; organizerToken: string; organizerId: string; startsAt: string }> {
  const organizer = await newUser(app, "org");
  const eventId = await createDraftEvent(app, organizer.token, overrides.title ?? "QA Published Event");

  const startsAt = overrides.startsAt ?? jitteredFutureDate().toISOString();
  const patchBody: Record<string, unknown> = {
    description: "A perfectly normal QA description with no flagged content.",
    categoryId,
    startsAt,
    approvalMode: overrides.approvalMode ?? "AUTO",
    priceType: overrides.priceType ?? "FREE",
    visibility: overrides.visibility ?? "PUBLIC",
  };
  if (overrides.format === "ONLINE") {
    patchBody.format = "ONLINE";
    patchBody.onlineUrl = overrides.onlineUrl ?? "https://meet.example.com/qa-room";
  } else {
    patchBody.cityId = cityId;
  }
  if (overrides.priceType === "PAID") {
    patchBody.price = overrides.price ?? 200;
    patchBody.paymentUrl = overrides.paymentUrl ?? "https://pay.example.com/qa-invoice";
  }
  if (overrides.capacity !== undefined) patchBody.capacity = overrides.capacity;
  if (overrides.minParticipants !== undefined) patchBody.minParticipants = overrides.minParticipants;
  if (overrides.registrationDeadline !== undefined) patchBody.registrationDeadline = overrides.registrationDeadline;

  const patched = await http(app)
    .patch(`/api/v1/events/${eventId}`)
    .set("Authorization", `Bearer ${organizer.token}`)
    .send(patchBody)
    .expect(200);

  const published = await http(app)
    .post(`/api/v1/events/${eventId}/publish`)
    .set("Authorization", `Bearer ${organizer.token}`)
    .expect(201);

  return {
    eventId,
    slug: patched.body.slug as string,
    organizerToken: organizer.token,
    organizerId: organizer.id,
    startsAt: published.body.startsAt ?? startsAt,
  };
}

/** Full cleanup of every row this auditor's tests may have created, scoped to the qa-ev- prefix. Never touches other prefixes. */
export async function cleanupQaData(prisma: PrismaService): Promise<void> {
  const ownerFilter = { owner: { email: { startsWith: QA_PREFIX } } };
  const userFilter = { email: { startsWith: QA_PREFIX } };

  await prisma.registrationAnswer.deleteMany({ where: { registration: { event: ownerFilter } } });
  await prisma.eventInvitation.deleteMany({ where: { event: ownerFilter } });
  await prisma.eventCollaborator.deleteMany({ where: { event: ownerFilter } });
  await prisma.eventReview.deleteMany({ where: { event: ownerFilter } });
  await prisma.eventFaqItem.deleteMany({ where: { event: ownerFilter } });
  await prisma.eventPriceOption.deleteMany({ where: { event: ownerFilter } });
  await prisma.registrationField.deleteMany({ where: { event: ownerFilter } });
  await prisma.registration.deleteMany({ where: { event: ownerFilter } });
  await prisma.registration.deleteMany({ where: { user: userFilter } });
  await prisma.savedEvent.deleteMany({ where: { OR: [{ event: ownerFilter }, { user: userFilter }] } });
  await prisma.eventMedia.deleteMany({ where: { event: ownerFilter } });
  await prisma.notification.deleteMany({ where: { user: userFilter } });
  await prisma.eventAnalyticsEvent.deleteMany({ where: { event: ownerFilter } }).catch(() => undefined);
  await prisma.eventDailyStat.deleteMany({ where: { event: ownerFilter } }).catch(() => undefined);
  await prisma.listingCreditLedger.deleteMany({ where: { user: userFilter } });
  await prisma.event.updateMany({ where: ownerFilter, data: { seriesId: null } });
  await prisma.eventSeries.deleteMany({ where: { owner: userFilter } });
  await prisma.event.deleteMany({ where: ownerFilter });
  await prisma.user.deleteMany({ where: userFilter });
}
