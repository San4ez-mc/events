import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ResourceNotFoundException } from "../common/exceptions/common-exceptions";

/** Formats a Date as the UTC "floating" form iCalendar expects: YYYYMMDDTHHMMSSZ. */
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Folds/escapes a text value per RFC 5545 §3.3.11 — commas, semicolons, backslashes and newlines all need escaping inside a value. */
function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/**
 * Marketing/UX — "add to calendar" for a registered event. A plain .ics file needs no Google (or
 * any) API/OAuth: it's a static text format every calendar app (including Google Calendar, via
 * its own "import" or just opening the file) already knows how to read.
 */
@Injectable()
export class CalendarExportService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(eventId: string, appUrl: string): Promise<string> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        slug: true,
        title: true,
        description: true,
        status: true,
        startsAt: true,
        endsAt: true,
        addressText: true,
        onlineUrl: true,
        city: { select: { nameUk: true } },
      },
    });
    if (!event) throw new ResourceNotFoundException("Event not found");
    if (!["PUBLISHED", "COMPLETED"].includes(event.status)) throw new ResourceNotFoundException("Event not found");
    if (!event.startsAt) throw new ResourceNotFoundException("Event has no scheduled start time");

    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 60 * 60 * 1000); // default 2h, matches the wizard's own default duration
    const location = event.onlineUrl || [event.addressText, event.city?.nameUk].filter(Boolean).join(", ");
    const url = `${appUrl}/events/${event.slug}`;

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kiro//Events//UK",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${eventId}@kiro.fineko.space`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(event.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(event.title)}`,
      event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
      location ? `LOCATION:${icsEscape(location)}` : null,
      `URL:${url}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter((line): line is string => line !== null);

    return lines.join("\r\n");
  }
}
