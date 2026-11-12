// native/app/src/lib/clubRounds.ts
// #2753 D4: klubbturneringene på Hjem. Radene er turneringslistas egne
// (`GET /api/terminliste`, #2838), så serveren har alt sortert bort runder du
// står på, utløpte klubber og runder der påmeldingen er stengt. Her står bare
// det Hjem legger til: kilden `club`, og fra og med i dag.
import type { AppTerminEntry } from '../../../../lib/games/appTerminView';
import type { AppLeagueSummary } from '../../../../lib/league/appLeagueView';
import { osloDateKey } from '../../../../lib/format/osloCalendar';
import { groupTerminByDate, type TerminDayLabel } from '../../../../lib/games/terminliste';
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

/**
 * One block in the «Klubbturneringer» section (#2839): a day with the rounds
 * that tee off then and the leagues that start then, or the leagues whose
 * season has already begun, under their own small heading at the bottom.
 */
export type ClubSectionGroup =
  | { kind: 'day'; key: string; teeOff: string; label: TerminDayLabel; rounds: AppTerminEntry[]; leagues: AppLeagueSummary[] }
  | { kind: 'undated'; key: 'undated'; rounds: AppTerminEntry[] }
  | { kind: 'leagues'; key: 'leagues'; leagues: AppLeagueSummary[] };

/**
 * The section's blocks, in order. Rounds are grouped by day as in the
 * terminliste (`groupTerminByDate`). A joinable league stands under the day its
 * season starts, as one more row; one whose start day has passed stands in a
 * block of its own at the bottom (the owner's answer 13.11).
 */
export function clubSectionGroups(
  rounds: readonly AppTerminEntry[],
  leagues: readonly AppLeagueSummary[],
  now: Date,
): ClubSectionGroup[] {
  const groups: ClubSectionGroup[] = [];
  for (const g of groupTerminByDate(rounds, now, localDateParts)) {
    const entries = g.entries as AppTerminEntry[];
    if (g.kind === 'day') groups.push({ kind: 'day', key: g.key, teeOff: g.teeOff, label: g.label, rounds: entries, leagues: [] });
    else groups.push({ kind: 'undated', key: 'undated', rounds: entries });
  }
  const today = osloDateKey(now, localDateParts);
  const later: AppLeagueSummary[] = [];
  for (const league of [...leagues].sort((a, b) => a.name.localeCompare(b.name, 'nb'))) {
    if (league.seasonStart < today) {
      later.push(league);
      continue;
    }
    const existing = groups.find((g) => g.kind === 'day' && g.key === league.seasonStart);
    if (existing && existing.kind === 'day') {
      existing.leagues.push(league);
      continue;
    }
    // A day with only leagues: the heading and the label come from the same
    // grouping the rounds use, on a stand-in that has just a name and a time.
    const [y, m, d] = league.seasonStart.split('-').map(Number);
    const standIn = { name: league.name, scheduled_tee_off_at: new Date(y!, m! - 1, d!, 0, 0).toISOString() } as unknown as AppTerminEntry;
    const [day] = groupTerminByDate([standIn], now, localDateParts);
    if (day?.kind !== 'day') continue;
    const at = groups.findIndex((g) => g.kind === 'day' && g.key > league.seasonStart);
    const added: ClubSectionGroup = { kind: 'day', key: day.key, teeOff: day.teeOff, label: day.label, rounds: [], leagues: [league] };
    if (at === -1) {
      const undated = groups.findIndex((g) => g.kind === 'undated');
      groups.splice(undated === -1 ? groups.length : undated, 0, added);
    } else groups.splice(at, 0, added);
  }
  if (later.length > 0) groups.push({ kind: 'leagues', key: 'leagues', leagues: later });
  return groups;
}
