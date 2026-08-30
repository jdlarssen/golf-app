// Native N3 (#1825): spillerens egne spill til hjem-skjermen.
//
// Speiler webbens hjem-spørring (`app/[locale]/page.tsx`): les EGNE
// `game_players`-rader med spillet embeddet, og hopp over deriverte spill
// (`source_game_id` satt) — de er cup-halvdeler som aldri vises som egne kort.
//
// Én spørring for alle tre seksjonene i stedet for tre: RLS gjør samme jobb
// uansett, og en runde mindre på 4G merkes på en teeboks. Delingen i seksjoner
// skjer lokalt i `splitHomeCards`.
//
// Samme cache-mønster som `gameBundle.ts`: `cache_entries`-raden tegnes med én
// gang, refetchen skjer i bakgrunnen. Uten cache OG uten nett er hjem tomt —
// det er den ene skjermen som ikke kan virke offline på første start.
import {
  resolveActiveCardState,
  type ActiveCardState,
} from '../../../../lib/games/activeCardState';
import { supabase } from '../supabase';
import { getCacheEntry, getDb, putCacheEntry } from './db';

export const HOME_CACHE_KEY = 'home';

/** Ett kort på hjem-skjermen. Alt kortet viser, ingenting mer. */
export interface HomeCard {
  gameId: string;
  name: string;
  status: string;
  courseName: string | null;
  scheduledTeeOffAt: string | null;
  createdAt: string;
  /** Kun for aktive spill — badge-teksten kommer fra den delte tilstanden. */
  state: ActiveCardState | null;
}

export interface HomeList {
  cards: HomeCard[];
  /** Når lista sist ble hentet fra serveren (ISO). */
  fetchedAt: string;
}

interface HomeRow {
  game_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  approved_at: string | null;
  games: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    scheduled_tee_off_at: string | null;
    require_peer_approval: boolean;
    courses: { name: string } | null;
  };
}

const HOME_SELECT =
  'game_id, submitted_at, withdrawn_at, approved_at, games!inner(id, name, status, created_at, scheduled_tee_off_at, require_peer_approval, courses(name))';

/**
 * Statusene en spiller har noe å gjøre med. `draft` er admin-eid og usynlig.
 * `as const` er ikke pynt: `.in()` er typet mot `game_status`-enumet, så en
 * skrivefeil her blir en tsc-feil i stedet for en tom liste i appen.
 */
const VISIBLE_STATUSES = ['scheduled', 'active', 'finished'] as const;

export async function fetchHomeCards(userId: string): Promise<HomeList> {
  const { data, error } = await supabase
    .from('game_players')
    .select(HOME_SELECT)
    .eq('user_id', userId)
    .in('games.status', VISIBLE_STATUSES)
    .is('games.source_game_id', null)
    .returns<HomeRow[]>();

  if (error) throw new Error(error.message);

  const cards: HomeCard[] = (data ?? []).map((row) => ({
    gameId: row.games.id,
    name: row.games.name,
    status: row.games.status,
    courseName: row.games.courses?.name ?? null,
    scheduledTeeOffAt: row.games.scheduled_tee_off_at,
    createdAt: row.games.created_at,
    state:
      row.games.status === 'active'
        ? resolveActiveCardState({
            submitted_at: row.submitted_at,
            withdrawn_at: row.withdrawn_at,
            approved_at: row.approved_at,
            require_peer_approval: row.games.require_peer_approval,
          })
        : null,
  }));

  return { cards, fetchedAt: new Date().toISOString() };
}

/** Lista som ligger på enheten, eller `undefined` om den aldri er hentet. */
export async function loadHomeCards(): Promise<HomeList | undefined> {
  const db = await getDb();
  const entry = await getCacheEntry(db, HOME_CACHE_KEY);
  if (!entry) return undefined;
  try {
    return JSON.parse(entry.payload) as HomeList;
  } catch {
    // Ødelagt nyttelast leses som «ingen cache» — neste refetch skriver den om.
    return undefined;
  }
}

/**
 * Hent på nytt og legg i cachen. Som i `gameBundle.ts` slipper kastet ut FØR vi
 * rører cachen, så en feilet refetch lar den forrige lista stå.
 */
export async function refreshHomeCards(userId: string): Promise<HomeList> {
  const list = await fetchHomeCards(userId);
  const db = await getDb();
  await putCacheEntry(db, {
    key: HOME_CACHE_KEY,
    payload: JSON.stringify(list),
    fetchedAt: list.fetchedAt,
  });
  return list;
}

/** Hvor mange avsluttede spill hjem viser. Resten bor på nettsiden. */
const FINISHED_LIMIT = 5;

/**
 * Del kortene i de tre seksjonene hjem viser.
 *
 * Rekkefølgene er de webben bruker: planlagte etter nærmeste tee-off (spill
 * uten klokkeslett havner bakerst), avsluttede nyest først.
 */
export function splitHomeCards(cards: readonly HomeCard[]): {
  active: HomeCard[];
  scheduled: HomeCard[];
  finished: HomeCard[];
} {
  const active = cards.filter((c) => c.status === 'active');
  const scheduled = cards
    .filter((c) => c.status === 'scheduled')
    .sort((a, b) => {
      if (a.scheduledTeeOffAt === b.scheduledTeeOffAt) return 0;
      if (a.scheduledTeeOffAt == null) return 1;
      if (b.scheduledTeeOffAt == null) return -1;
      return a.scheduledTeeOffAt < b.scheduledTeeOffAt ? -1 : 1;
    });
  const finished = cards
    .filter((c) => c.status === 'finished')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, FINISHED_LIMIT);
  return { active, scheduled, finished };
}
