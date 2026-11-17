import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
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

export interface InvitedPerson {
  id: string;
  name: string;
  joinedAt: string;
  /** Has created an event, i.e. became an organizer. */
  isOrganizer: boolean;
  eventsPublished: number;
}

export interface MyInvites {
  code: string;
  link: string;
  /** How many times the link was opened. */
  clicks: number;
  total: number;
  organizers: number;
  invited: InvitedPerson[];
}

export interface InviterRow {
  inviter: { id: string; name: string; email: string };
  clicks: number;
  invited: number;
  organizers: number;
  eventsPublished: number;
  people: { id: string; name: string; email: string; joinedAt: string; isOrganizer: boolean; eventsPublished: number }[];
}

export interface InvitesOverview {
  inviters: InviterRow[];
  totals: { inviters: number; invited: number; organizers: number };
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
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { referralClicks: true } });
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
    return { code, link: this.linkFor(code), clicks: me?.referralClicks ?? 0, total: invited.length, organizers: invited.filter((p) => p.isOrganizer).length, invited };
  }

  /** The invitation link was opened: counts the click for the person it belongs to (unknown codes are ignored). */
  async registerClick(rawCode: string): Promise<void> {
    const code = normalizeInviteCode(rawCode);
    if (!code) return;
    await this.prisma.user.updateMany({ where: { referralCode: code }, data: { referralClicks: { increment: 1 } } });
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
        invitedUsers: {
          orderBy: { referredAt: "desc" },
          select: { id: true, name: true, nickname: true, email: true, referredAt: true, createdAt: true, organizerActivatedAt: true, _count: { select: { events: { where: PUBLISHED_EVENTS } } } },
        },
      },
    });
    const rows: InviterRow[] = inviters
      .map((u) => {
        const people = u.invitedUsers.map((p) => ({
          id: p.id,
          name: p.name ?? p.nickname ?? "—",
          email: p.email,
          joinedAt: (p.referredAt ?? p.createdAt).toISOString(),
          isOrganizer: p.organizerActivatedAt !== null,
          eventsPublished: p._count.events,
        }));
        return {
          inviter: { id: u.id, name: u.name ?? u.nickname ?? "—", email: u.email },
          clicks: u.referralClicks,
          invited: people.length,
          organizers: people.filter((p) => p.isOrganizer).length,
          eventsPublished: people.reduce((sum, p) => sum + p.eventsPublished, 0),
          people,
        };
      })
      .sort((a, b) => b.organizers - a.organizers || b.invited - a.invited);
    return {
      inviters: rows,
      totals: { inviters: rows.length, invited: rows.reduce((s, r) => s + r.invited, 0), organizers: rows.reduce((s, r) => s + r.organizers, 0) },
    };
  }
}
