// native/app/src/lib/repeatWeeklyCopy.ts
// #2460 «Gjenta hver uke» på «Klar?». Samme ord som nettet, låst av den delte fasiten
// `lib/games/weeklyRepeatCopyCases.ts` (`repeatWeeklyCopy.parity.test.ts`).
//
// **Enhetens lokaltid, ingen `Intl`.** Datoen er tee-off pluss sju kalenderdager på
// veggklokka (`nextWeeklyLocal`), lest med telefonens egne gettere, som `formatTeeOff` i
// `display.ts`. Webbens Oslo-vei (`formatOsloDateTimeLocal`) er stengt her: Hermes mangler
// ICU-tidssonene. For en arrangør i Norge er det samme dag og klokkeslett som serveren
// regner ut i Oslo-tid når den lager neste runde. `formatTeeOffLongDate` er ren
// strengformatering uten `Intl`.
import { nextWeeklyLocal } from '../../../../lib/games/weeklyRepeatRule';
import { formatTeeOffLongDate } from '../../../../lib/format/teeOff';

export const REPEAT_WEEKLY_KICKER = 'Gjenta';
export const REPEAT_WEEKLY_TITLE = 'Gjenta hver uke';

const SAME_GROUP = 'Samme gjeng får invitasjon når denne runden er ferdig.';

const pad = (n: number) => String(n).padStart(2, '0');

/** Utkastets tidspunkt som telefonens veggklokke, `YYYY-MM-DDTHH:mm`. */
function deviceWallClock(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Linja under bryteren: når neste runde er. `teeOffAt` er utkastets ISO-tidspunkt. */
export function repeatWeeklyNextText(teeOffAt: string | null): string {
  const local = teeOffAt ? deviceWallClock(teeOffAt) : null;
  const next = local ? nextWeeklyLocal(local) : null;
  const when = next ? formatTeeOffLongDate(next, 'no') : null;
  return when ? `Neste: ${when}. ${SAME_GROUP}` : `Neste: samme dag og tid uka etter. ${SAME_GROUP}`;
}
