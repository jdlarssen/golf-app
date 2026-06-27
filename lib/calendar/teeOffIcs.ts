/**
 * Tee-off iCalendar (.ics) builder — RFC 5545 (#945).
 *
 * Pure function: produces a single-VEVENT VCALENDAR string for a planned
 * tee-off so a player can drop the round into their phone calendar with a
 * reminder. Every time-dependent input (dtstamp) is injected by the caller so
 * the output is deterministic and unit-testable to the second.
 *
 * Time policy: `teeOffAt` is an absolute instant (the DB stores
 * `scheduled_tee_off_at` as `timestamptz`). We emit DTSTART/DTEND in UTC form
 * (`YYYYMMDDTHHMMSSZ`) — unambiguous, and the calendar app converts to the
 * device's local wall-clock. No VTIMEZONE block is needed; the Oslo helpers in
 * lib/format are for *display*, not for the absolute .ics timestamp.
 */

export type TeeOffIcsInput = {
  /** Stable, globally-unique event id, e.g. `teeoff-${gameId}@tornygolf.no`. */
  uid: string;
  gameName: string;
  /** Course name → LOCATION. Omitted when null/blank. */
  courseName: string | null;
  /** Absolute tee-off instant. */
  teeOffAt: Date;
  /** Event length in minutes (DTEND = DTSTART + this). */
  durationMinutes: number;
  /** Lead time for the reminder alarm; 0 disables the VALARM. */
  reminderMinutes: number;
  /** Localised SUMMARY (event title). */
  summary: string;
  /** Localised DESCRIPTION (may contain a link back to the game). */
  description: string;
  /** Injected "now" for DTSTAMP (testability). */
  dtstamp: Date;
};

const PRODID = '-//Tørny//Tee-off//NO';

/** Format an instant as RFC 5545 UTC date-time: `YYYYMMDDTHHMMSSZ`. */
function formatUtc(date: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return (
    `${p(date.getUTCFullYear(), 4)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/**
 * Escape an iCalendar TEXT value per RFC 5545 §3.3.11. Backslash must be
 * escaped first so we don't double-escape the backslashes we introduce for
 * the other specials.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Fold a content line to ≤75 octets (RFC 5545 §3.1): a CRLF followed by a
 * single space continues the line. We measure in UTF-8 octets and only break
 * on character boundaries so a multi-byte codepoint (æøå) is never split.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  // First physical line: 75 octets. Continuation lines: a leading space costs
  // one octet, so 74 octets of content each.
  let current = '';
  let currentBytes = 0;
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = char;
      currentBytes = charBytes;
      limit = 74; // continuation lines carry a leading space
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Render `prop:value`, escaping the TEXT value and folding the result. */
function textProp(prop: string, value: string): string {
  return foldLine(`${prop}:${escapeText(value)}`);
}

/** Build the `-PTnH` / `-PTnM` trigger for a lead time in minutes. */
function alarmTrigger(minutes: number): string {
  return minutes % 60 === 0 ? `-PT${minutes / 60}H` : `-PT${minutes}M`;
}

export function buildTeeOffIcs(input: TeeOffIcsInput): string {
  const start = input.teeOffAt;
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}`,
    `DTSTAMP:${formatUtc(input.dtstamp)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    textProp('SUMMARY', input.summary),
  ];

  const trimmedCourse = input.courseName?.trim();
  if (trimmedCourse) {
    lines.push(textProp('LOCATION', trimmedCourse));
  }

  lines.push(textProp('DESCRIPTION', input.description));

  if (input.reminderMinutes > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      textProp('DESCRIPTION', input.summary),
      `TRIGGER:${alarmTrigger(input.reminderMinutes)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  // RFC 5545 requires CRLF line breaks; trailing CRLF closes the final line.
  return lines.join('\r\n') + '\r\n';
}
