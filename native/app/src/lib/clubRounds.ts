// native/app/src/lib/clubRounds.ts
// #2753 D4: klubbturneringene på Hjem. Radene er turneringslistas egne
// (`GET /api/terminliste`, #2838), så serveren har alt sortert bort runder du
// står på, utløpte klubber og runder der påmeldingen er stengt. Her står bare
// det Hjem legger til: kilden `club`, og fra og med i dag.
import type { AppTerminEntry } from '../../../../lib/games/appTerminView';
import { osloDateKey } from '../../../../lib/format/osloCalendar';
import { localDateParts } from './homeDates';

export function clubRoundsForHome(entries: readonly AppTerminEntry[], now: Date): AppTerminEntry[] {
  const today = osloDateKey(now, localDateParts);
  return entries
    .filter((entry) => entry.source === 'club')
    .filter((entry) => {
      // Uten tee-off står runden: den er åpen for påmelding, og dagen er ukjent.
      if (!entry.scheduled_tee_off_at) return true;
      return osloDateKey(new Date(entry.scheduled_tee_off_at), localDateParts) >= today;
    })
    // Tidligst først; en runde uten tid står sist.
    .sort((a, b) => teeOffMs(a) - teeOffMs(b));
}

function teeOffMs(entry: AppTerminEntry): number {
  return entry.scheduled_tee_off_at ? new Date(entry.scheduled_tee_off_at).getTime() : Number.MAX_SAFE_INTEGER;
}
