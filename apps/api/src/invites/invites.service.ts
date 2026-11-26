import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { SUBSCRIPTION_TIERS } from "@kiro/config";
import type { EnvConfig } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";

/** No 0/O/1/I: the code is read out loud and typed by hand. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** What the sign-up forms and the invitation link send, normalised to the stored form ("ab3d-ef4g" -> "AB3DEF4G"). */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length === CODE_LENGTH ? code : null;
}

export type InviteDevice = "ANDROID" | "IPHONE" | "DESKTOP" | "OTHER";
const DEVICES: readonly string[] = ["ANDROID", "IPHONE", "DESKTOP", "OTHER"];

/** One counted action on the link, newest first in the lists. */
export interface InviteAction {
  at: string;
  device: InviteDevice;
}

export interface InvitedPerson {
  id: string;
  name: string;
  joinedAt: string;
  /** Has created an event, i.e. became an organizer. */
  isOrganizer: boolean;
  eventsPublished: number;
  /** Titles of the events this person published (up to 5), newest first. */
  events?: { title: string; slug: string; status: string }[];
}

export interface MyInvites {
  code: string;
  link: string;
  /** How many times the link was opened. */
  clicks: number;
  /** How many times "download" was pressed on the landing page with this person's code. */
  downloadClicks: number;
  total: number;
  organizers: number;
  invited: InvitedPerson[];
  /** The last opens and download presses behind the counters (the log starts when it was introduced). */
  visits: InviteAction[];
  downloads: InviteAction[];
}

export interface InviterDetails {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  downloadClicks: number;
  visits: InviteAction[];
  downloads: InviteAction[];
  /** How many of the invited people paid for a subscription at least once, and the sum (UAH). */
  payers: number;
  paidAmount: number;
  people: (InvitedPerson & { email: string; paid: boolean; paidAmount: number })[];
}

export interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  downloadClicks: number;
  invited: number;
  organizers: number;
  eventsPublished: number;
  /** Invited people who paid for a subscription at least once, and the sum they paid (UAH). */
  payers: number;
  paidAmount: number;
  people: { id: string; name: string; email: string; joinedAt: string; isOrganizer: boolean; eventsPublished: number; paid: boolean; paidAmount: number }[];
}

export interface InvitesOverview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number; payers: number; paidAmount: number };
}

const PUBLISHED_EVENTS = { status: { in: ["PUBLISHED", "COMPLETED"] }, isTest: false } satisfies Prisma.EventWhereInput;

/** Personal invitation links ("/r/<code>") and who invited whom, so the owner knows who brings organizers in. */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  private newCode(): string {
    return Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  }

  /** The person's code, created on first use. A clash with another code (1 in 10^11) just draws again. */
  async ensureCode(userId: string): Promise<string> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (existing?.referralCode) return existing.referralCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const updated = await this.prisma.user.update({ where: { id: userId }, data: { referralCode: this.newCode() }, select: { referralCode: true } });
        return updated.referralCode!;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
    throw new Error("Could not create an invitation code");
  }

  private linkFor(code: string): string {
    return `${this.config.get("APP_URL", { infer: true }).replace(/\/$/, "")}/r/${code}`;
  }

  async mine(userId: string): Promise<MyInvites> {
    const code = await this.ensureCode(userId);
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralClicks: true, referralDownloadClicks: true } });
    const people = await this.prisma.user.findMany({
      where: { referredById: userId },
      orderBy: { referredAt: "desc" },
      select: { id: true, name: true, nickname: true, referredAt: true, createdAt: true, organizerActivatedAt: true, _count: { select: { events: { where: PUBLISHED_EVENTS } } } },
    });
    const invited: InvitedPerson[] = people.map((p) => ({
      id: p.id,
      name: p.name ?? p.nickname ?? "—",
      joinedAt: (p.referredAt ?? p.createdAt).toISOString(),
      isOrganizer: p.organizerActivatedAt !== null,
      eventsPublished: p._count.events,
    }));
    const { visits, downloads } = await this.actionLists(userId);
    return { code, link: this.linkFor(code), clicks: me?.referralClicks ?? 0, downloadClicks: me?.referralDownloadClicks ?? 0, total: invited.length, organizers: invited.filter((p) => p.isOrganizer).length, invited, visits, downloads };
  }

  /** The invitation link was opened: counts the click for the person it belongs to (unknown codes are ignored). */
  async registerClick(rawCode: string, kind: "visit" | "download" = "visit", device?: string): Promise<void> {
    const code = normalizeInviteCode(rawCode);
    if (!code) return;
    const inviter = await this.prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!inviter) return;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: inviter.id }, data: kind === "download" ? { referralDownloadClicks: { increment: 1 } } : { referralClicks: { increment: 1 } } }),
      this.prisma.inviteEvent.create({ data: { inviterId: inviter.id, kind: kind === "download" ? "DOWNLOAD" : "VISIT", device: device && DEVICES.includes(device) ? device : "OTHER" } }),
    ]);
  }

  /**
   * What each of these people paid for a subscription (UAH), only those who paid at least once.
   * Web payments (WayForPay/Mono) are exact: the paid order amounts. Google Play keeps one row per purchase and the app
   * never sees the charge, so each row counts at the tier's list price (renewals are not counted again). Admin grants are free.
   */
  private async paidByUser(userIds: string[]): Promise<Map<string, number>> {
    const paid = new Map<string, number>();
    if (userIds.length === 0) return paid;
    const [orders, play] = await Promise.all([
      this.prisma.platformPaymentOrder.groupBy({ by: ["userId"], where: { userId: { in: userIds }, status: "PAID", subscriptionTier: { not: null } }, _sum: { amount: true } }),
      this.prisma.platformSubscription.findMany({ where: { userId: { in: userIds }, provider: "GOOGLE_PLAY" }, select: { userId: true, tier: true } }),
    ]);
    for (const o of orders) paid.set(o.userId, (paid.get(o.userId) ?? 0) + Number(o._sum.amount ?? 0));
    for (const s of play) paid.set(s.userId, (paid.get(s.userId) ?? 0) + SUBSCRIPTION_TIERS[s.tier].price);
    return paid;
  }

  /** The last 100 opens and download presses of one person's link, newest first. */
  private async actionLists(userId: string): Promise<{ visits: InviteAction[]; downloads: InviteAction[] }> {
    const rows = await this.prisma.inviteEvent.findMany({ where: { inviterId: userId }, orderBy: { createdAt: "desc" }, take: 200, select: { kind: true, device: true, createdAt: true } });
    const toAction = (r: { device: string; createdAt: Date }): InviteAction => ({ at: r.createdAt.toISOString(), device: r.device as InviteDevice });
    return { visits: rows.filter((r) => r.kind === "VISIT").slice(0, 100).map(toAction), downloads: rows.filter((r) => r.kind === "DOWNLOAD").slice(0, 100).map(toAction) };
  }

  /** Admin: everything behind one person's numbers: each open, each download press, and the people who signed up. */
  async details(userId: string): Promise<InviterDetails | null> {
    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, nickname: true, email: true, referralClicks: true, referralDownloadClicks: true },
    });
    if (!inviter) return null;
    const [{ visits, downloads }, people, paidBy] = await Promise.all([
      this.actionLists(userId),
      this.prisma.user.findMany({
        where: { referredById: userId },
        orderBy: { referredAt: "desc" },
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true,
          referredAt: true,
          createdAt: true,
          organizerActivatedAt: true,
          _count: { select: { events: { where: PUBLISHED_EVENTS } } },
          events: { where: { isTest: false, status: { not: "DRAFT" } }, orderBy: { createdAt: "desc" }, take: 5, select: { title: true, slug: true, status: true } },
        },
      }),
      this.prisma.user.findMany({ where: { referredById: userId }, select: { id: true } }).then((rows) => this.paidByUser(rows.map((r) => r.id))),
    ]);
    return {
      inviter: { id: inviter.id, name: inviter.name ?? inviter.nickname ?? "—", email: inviter.email },
      clicks: inviter.referralClicks,
      downloadClicks: inviter.referralDownloadClicks,
      visits,
      downloads,
      payers: people.filter((p) => paidBy.has(p.id)).length,
      paidAmount: people.reduce((sum, p) => sum + (paidBy.get(p.id) ?? 0), 0),
      people: people.map((p) => ({
        id: p.id,
        name: p.name ?? p.nickname ?? "—",
        email: p.email,
        joinedAt: (p.referredAt ?? p.createdAt).toISOString(),
        isOrganizer: p.organizerActivatedAt !== null,
        eventsPublished: p._count.events,
        events: p.events,
        paid: paidBy.has(p.id),
        paidAmount: paidBy.get(p.id) ?? 0,
      })),
    };
  }

  /** Admin: every person who invited someone, with the people they brought and which of them became organizers. */
  async overview(): Promise<InvitesOverview> {
    const inviters = await this.prisma.user.findMany({
      where: { invitedUsers: { some: {} } },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        referralClicks: true,
        referralDownloadClicks: true,
        invitedUsers: {
          orderBy: { referredAt: "desc" },
          select: { id: true, name: true, nickname: true, email: true, referredAt: true, createdAt: true, organizerActivatedAt: true, _count: { select: { events: { where: PUBLISHED_EVENTS } } } },
        },
      },
    });
    const paidBy = await this.paidByUser(inviters.flatMap((u) => u.invitedUsers.map((p) => p.id)));
    const rows: InviterRow[] = inviters
      .map((u) => {
        const people = u.invitedUsers.map((p) => ({
          id: p.id,
          name: p.name ?? p.nickname ?? "—",
          email: p.email,
          joinedAt: (p.referredAt ?? p.createdAt).toISOString(),
          isOrganizer: p.organizerActivatedAt !== null,
          eventsPublished: p._count.events,
          paid: paidBy.has(p.id),
          paidAmount: paidBy.get(p.id) ?? 0,
        }));
        return {
          inviter: { id: u.id, name: u.name ?? u.nickname ?? "—", email: u.email },
          clicks: u.referralClicks,
          downloadClicks: u.referralDownloadClicks,
          invited: people.length,
          organizers: people.filter((p) => p.isOrganizer).length,
          eventsPublished: people.reduce((sum, p) => sum + p.eventsPublished, 0),
          payers: people.filter((p) => p.paid).length,
          paidAmount: people.reduce((sum, p) => sum + p.paidAmount, 0),
          people,
        };
      })
      .sort((a, b) => b.organizers - a.organizers || b.invited - a.invited);
    return {
      inviters: rows,
      totals: {
        inviters: rows.length,
        invited: rows.reduce((s, r) => s + r.invited, 0),
        organizers: rows.reduce((s, r) => s + r.organizers, 0),
        payers: rows.reduce((s, r) => s + r.payers, 0),
        paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0),
      },
    };
  }
}
