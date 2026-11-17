// native/app/src/lib/repeatWeeklyCopy.ts
// #2460 «Gjenta hver uke» på «Klar?». Samme ord som nettet, låst av den delte fasiten
// `lib/games/weeklyRepeatCopyCases.ts` (`repeatWeeklyCopy.parity.test.ts`).
//
// Datoen er tee-off pluss sju dager på Oslo-klokka (`nextWeeklyLocal`), samme regel som
// lager neste runde på serveren, og skrives med den delte `formatTeeOffLongDate`.
import { formatOsloDateTimeLocal } from '../../../../lib/games/gamePayload';
import { nextWeeklyLocal } from '../../../../lib/games/weeklyRepeat';
import { formatTeeOffLongDate } from '../../../../lib/format/teeOff';

export const REPEAT_WEEKLY_KICKER = 'Gjenta';
export const REPEAT_WEEKLY_TITLE = 'Gjenta hver uke';

const SAME_GROUP = 'Samme gjeng får invitasjon når denne runden er ferdig.';

/** Linja under bryteren: når neste runde er. `teeOffAt` er utkastets ISO-tidspunkt. */
export function repeatWeeklyNextText(teeOffAt: string | null): string {
  let when: string | null = null;
  if (teeOffAt && !Number.isNaN(new Date(teeOffAt).getTime())) {
    const next = nextWeeklyLocal(formatOsloDateTimeLocal(teeOffAt));
    when = next ? formatTeeOffLongDate(next, 'no') : null;
  }
  return when ? `Neste: ${when}. ${SAME_GROUP}` : `Neste: samme dag og tid uka etter. ${SAME_GROUP}`;
}
