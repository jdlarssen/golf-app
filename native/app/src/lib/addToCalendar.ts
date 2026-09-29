// #2255: «Legg til i kalender» på startbilletten.
//
// Det eneste stedet appen snakker med kalendermodulen, så skjermtestene kan
// mocke den her.
//
// **Minst mulig tilgang.** Vi åpner systemets eget ark for ny hendelse
// (`createEventInCalendarAsync`), der spilleren ser hendelsen og lagrer den
// selv. På iOS 17 og nyere trenger arket ingen kalendertilgang i det hele
// tatt (modulen sjekker bare tilgang før iOS 17), og på Android er det en
// vanlig systemforespørsel uten tillatelse. Bare på iOS før 17 må appen be om
// tilgang først, og der finnes ikke skrivetilgang alene. Sier spilleren nei,
// spør iOS aldri på nytt av seg selv, og appen gjør det heller ikke.
//
// **Modulen lastes ved trykk, ikke ved oppstart.** Et app-bygg fra før
// modulen kom inn, har ikke den native delen. Lastes den med én gang, krasjer
// spillets side. Lastes den ved trykk, får spilleren en rolig melding i
// stedet.
import { Platform } from 'react-native';
import type { CalendarEvent } from './gameTicket';

export type AddToCalendarResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'failed' };

/** iOS før 17 viser ikke arket uten kalendertilgang. */
export function needsPermissionFirst(os: string, version: string | number): boolean {
  if (os !== 'ios') return false;
  const major = Number.parseInt(String(version), 10);
  return Number.isFinite(major) && major < 17;
}

export async function addToCalendar(event: CalendarEvent): Promise<AddToCalendarResult> {
  try {
    // Lat `require`, ikke `import()`: jest kjører ikke dynamisk import, og
    // Metro gir samme lat lasting for begge.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lastes ved trykk, se toppen av fila
    const calendar = require('expo-calendar/legacy') as typeof import('expo-calendar/legacy');
    if (needsPermissionFirst(Platform.OS, Platform.Version)) {
      const permission = await calendar.requestCalendarPermissionsAsync();
      if (!permission.granted) return { ok: false, reason: 'denied' };
    }
    await calendar.createEventInCalendarAsync({
      title: event.title,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      notes: event.notes,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
