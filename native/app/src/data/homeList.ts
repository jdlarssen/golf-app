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
//
// #2254 (startboden) leser mer fra samme rad: formatet og segmentet (heltekortet
// og billetten), avslutningstiden (hvilken runde som er «forrige»), plassen fra
// `result_summary` og flighten. Brutto for forrige runde hentes i samme bølge.
import {
  resolveActiveCardState,
  type ActiveCardState,
} from '../../../../lib/games/activeCardState';
import { getRoundScoresForGames } from '../../../../lib/games/getRoundScoresForGames';
import { computeRoundScore } from '../../../../lib/games/roundScore';
import type { ResultSummary } from '../../../../lib/scoring/resultSummary';
import { currentDeviceUserId, supabase } from '../supabase';
import { getCacheEntry, getDb, putCacheEntry } from './db';

export const HOME_CACHE_KEY = 'home';

/**
 * Nyttelast-versjonen, samme mønster som `BUNDLE_PAYLOAD_VERSION`.
 *
 * v2 (#2254): kortene fikk `gameMode`, `holeSegment`, `endedAt`,
 * `resultSummary` og `flightNumber`, og lista fikk `lastRound`. En cache fra
 * før mangler dem, og et `undefined` i `holeSegment` ville stengt heltekortet
 * (`gateReason` tester mot `'full'`). Den leses derfor som «ingen cache».
 */
export const HOME_PAYLOAD_VERSION = 2;

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
  gameMode: string;
  /** `'full'` for vanlige spill; halvdelene av en delt cup-dag ellers. */
  holeSegment: string;
  /** Når spillet ble avsluttet, eller null. «Forrige runde» sorteres på den. */
  endedAt: string | null;
  /** Egen plass i et avsluttet spill (`game_players.result_summary`), eller null. */
  resultSummary: ResultSummary | null;
  /** Egen flight, eller null når spillet ikke er delt i flighter. */
  flightNumber: number | null;
}

/**
 * Brutto og netto for forrige runde, regnet som webbens «Runder»-rad
 * (`getRoundScoresForGames` + `computeRoundScore`). `teamBall`: laget delte én
 * ball, så slagene er ingens egne og runden vises som lagrunde.
 */
export interface LastRoundScore {
  gameId: string;
  brutto: number | null;
  netto: number | null;
  teamBall: boolean;
}

export interface HomeList {
  version: typeof HOME_PAYLOAD_VERSION;
  cards: HomeCard[];
  /** `null` når det ikke finnes noen avsluttet runde, eller hentingen feilet. */
  lastRound: LastRoundScore | null;
  /** Når lista sist ble hentet fra serveren (ISO). */
  fetchedAt: string;
}

interface HomeRow {
  game_id: string;
  submitted_at: string | null;
  withdrawn_at: string | null;
  approved_at: string | null;
  result_summary: ResultSummary | null;
  flight_number: number | null;
  games: {
    id: string;
    name: string;
    status: string;
    game_mode: string;
    hole_segment: string;
    created_at: string;
    ended_at: string | null;
    scheduled_tee_off_at: string | null;
    require_peer_approval: boolean;
    courses: { name: string } | null;
  };
}

const HOME_SELECT =
  'game_id, submitted_at, withdrawn_at, approved_at, result_summary, flight_number, games!inner(id, name, status, game_mode, hole_segment, created_at, ended_at, scheduled_tee_off_at, require_peer_approval, courses(name))';

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
    gameMode: row.games.game_mode,
    holeSegment: row.games.hole_segment,
    endedAt: row.games.ended_at,
    resultSummary: row.result_summary ?? null,
    flightNumber: row.flight_number,
  }));

  return {
    version: HOME_PAYLOAD_VERSION,
    cards,
    lastRound: await fetchLastRound(userId, cards),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Brutto for «Forrige runde», og bare for den: én runde koster tre små
 * spørringer, og Hjem viser tallet for én rad. Best-effort — feiler hentingen,
 * står raden med plassen alene, og resten av lista kommer fram som før.
 */
async function fetchLastRound(
  userId: string,
  cards: readonly HomeCard[],
): Promise<LastRoundScore | null> {
  const last = splitHomeCards(cards).finished[0];
  if (!last) return null;
  try {
    const inputs = (await getRoundScoresForGames(supabase, userId, [last.gameId])).get(
      last.gameId,
    );
    if (!inputs) return null;
    const { brutto, netto } = computeRoundScore(inputs.strokes, inputs.courseHandicap);
    return { gameId: last.gameId, brutto, netto, teamBall: inputs.teamBall };
  } catch {
    return null;
  }
}

/** Sant kun for en nyttelast skrevet av NÅVÆRENDE versjon av denne fila. */
function isCurrentList(parsed: unknown): parsed is HomeList {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    (parsed as { version?: unknown }).version === HOME_PAYLOAD_VERSION &&
    Array.isArray((parsed as { cards?: unknown }).cards)
  );
}

/**
 * Lista som ligger på enheten, eller `undefined` om den aldri er hentet — eller
 * ble skrevet av en eldre versjon av appen (se {@link HOME_PAYLOAD_VERSION}).
 */
export async function loadHomeCards(): Promise<HomeList | undefined> {
  const db = await getDb();
  const entry = await getCacheEntry(db, HOME_CACHE_KEY);
  if (!entry) return undefined;
  try {
    const parsed: unknown = JSON.parse(entry.payload);
    return isCurrentList(parsed) ? parsed : undefined;
  } catch {
    // Ødelagt nyttelast leses som «ingen cache» — neste refetch skriver den om.
    return undefined;
  }
}

/**
 * Hent på nytt og legg i cachen. Som i `gameBundle.ts` slipper kastet ut FØR vi
 * rører cachen, så en feilet refetch lar den forrige lista stå.
 *
 * **Sesjonsvakten (#1877).** `HOME_CACHE_KEY` er global — den har ingen
 * `userId` i seg, for det finnes bare én hjem-liste om gangen på en enhet. Da
 * kan en refetch som var i lufta da spilleren logget ut, lande ETTER at
 * utloggingen tømte basen og skrive forrige brukers kort inn igjen; neste
 * bruker på telefonen ville sett dem. Eier ikke den innloggede lenger lista vi
 * nettopp hentet, dropper vi derfor SKRIVINGEN. Lista returneres som før —
 * kalleren som ba om den, skal få den; det er bare sporet på disken vi ikke
 * legger igjen.
 *
 * Vakten sammenligner id-er i stedet for å nøye seg med «finnes det en
 * sesjon?». En null-sjekk ville sluppet gjennom det verre tilfellet: A sin
 * refetch henger (RN `fetch` har ingen tidsavbrudd), A logger ut, B logger inn
 * — og når svaret endelig lander, finnes det en sesjon, den er bare ikke A sin.
 * Da havner A sine spillnavn og baner på B sitt hjem.
 */
export async function refreshHomeCards(userId: string): Promise<HomeList> {
  const list = await fetchHomeCards(userId);

  // Leses etter fetchen, ikke før: vinduet vi vokter er nettopp det fetchen
  // brukte. `currentDeviceUserId` leser sesjonen fra lokalt lager og svarer
  // også offline (og null ved enhver feil), så vakten holder på en teeboks uten
  // dekning like godt som på wifi. Null dekkes av samme sammenligning.
  if ((await currentDeviceUserId()) !== userId) return list;

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

/** Når spillet sluttet, eller når det ble laget om sluttiden mangler. */
function finishedAt(card: HomeCard): string {
  return card.endedAt ?? card.createdAt;
}

/**
 * Del kortene i de tre seksjonene hjem viser.
 *
 * Rekkefølgene er de webben bruker: planlagte etter nærmeste tee-off (spill
 * uten klokkeslett havner bakerst), avsluttede nyest først etter når de ble
 * avsluttet (`getFinishedGamesForUser`, `byEndedAtDesc`). Før #2254 sorterte
 * appen på `created_at`, og da kunne «Forrige runde» blitt en annen runde enn
 * den du spilte sist.
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
    .sort((a, b) => {
      const ea = finishedAt(a);
      const eb = finishedAt(b);
      if (ea === eb) return 0;
      return ea < eb ? 1 : -1;
    })
    .slice(0, FINISHED_LIMIT);
  return { active, scheduled, finished };
}
