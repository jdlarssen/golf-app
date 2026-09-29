// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';

/**
 * Type A (#1891): den delte adgangssjekken for app→server-ruter.
 *
 * Reglene bor her og testes her: «hvem er kalleren» (kun fra det validerte
 * tokenet), «er kalleren arrangør» (admin ELLER oppretter), og fra #2215 hvem
 * som får godkjenne, avvise og åpne et scorekort, og hvem som får tømme
 * spill-cachen. Rutene som bruker dem tester sin egen HTTP-form, ikke reglene
 * på nytt.
 */

const VALID_TOKEN = 'gyldig-token';
const TOKEN_USER_ID = 'user-fra-token';

const CREATOR = 'oppretteren';
const ADMIN = 'klubb-admin';
const STRANGER = 'en-fremmed';
const GAME = 'spill-1';

// Spillere i det store spillet (#2215): seks aktive, to flighter, så
// attestant-regelen går på flight og ikke på «alle i én gruppe».
const MATE = 'flightkamerat';
const OWNER = 'kortets-eier';
const FAR = 'annen-flight';
const WITHDRAWN = 'trukket-spiller';
// #2200: kort noen andre i flighten leverte. Den som leverte, kan ikke også
// godkjenne kortet (vakta i 0191), men arrangøren og admin er unntatt.
const CARRIED = 'kort-levert-av-kamerat';
const CARRIED_BY_CREATOR = 'kort-levert-av-oppretteren';

/** Et spill med én flight (≤4 aktive) der oppretteren selv spiller. */
const SMALL_GAME = 'spill-med-en-flight';
const FINISHED_GAME = 'ferdig-spill';

type Game = { created_by: string; status: string; game_mode: string; name: string };
type RosterRow = {
  user_id: string;
  flight_number: number | null;
  withdrawn_at: string | null;
  submitted_by_user_id?: string | null;
};

const GAMES: Record<string, Game> = {
  [GAME]: { created_by: CREATOR, status: 'active', game_mode: 'stableford', name: 'Sommercup' },
  [SMALL_GAME]: { created_by: CREATOR, status: 'active', game_mode: 'stableford', name: 'Firer' },
  [FINISHED_GAME]: { created_by: CREATOR, status: 'finished', game_mode: 'stableford', name: 'Ferdig' },
};

const ROSTERS: Record<string, RosterRow[]> = {
  [GAME]: [
    { user_id: CREATOR, flight_number: 1, withdrawn_at: null },
    { user_id: MATE, flight_number: 1, withdrawn_at: null },
    { user_id: OWNER, flight_number: 1, withdrawn_at: null },
    { user_id: CARRIED, flight_number: 1, withdrawn_at: null, submitted_by_user_id: MATE },
    {
      user_id: CARRIED_BY_CREATOR,
      flight_number: 1,
      withdrawn_at: null,
      submitted_by_user_id: CREATOR,
    },
    { user_id: FAR, flight_number: 2, withdrawn_at: null },
    { user_id: 'f2-b', flight_number: 2, withdrawn_at: null },
    { user_id: 'f2-c', flight_number: 2, withdrawn_at: null },
    { user_id: WITHDRAWN, flight_number: 2, withdrawn_at: '2026-09-27T09:00:00Z' },
  ],
  [SMALL_GAME]: [
    { user_id: CREATOR, flight_number: null, withdrawn_at: null },
    // Klubb-adminen under leverte MATEs kort.
    { user_id: MATE, flight_number: null, withdrawn_at: null, submitted_by_user_id: ADMIN },
    { user_id: OWNER, flight_number: null, withdrawn_at: null },
    // En klubb-admin som selv spiller i den ene flighten.
    { user_id: ADMIN, flight_number: null, withdrawn_at: null },
  ],
};

/** Tabellen hvis lesing svarer med en DB-feil, eller `null` når alt går bra. */
let failingTable: string | null = null;

function respond(op: QueryOp): QueryResponse {
  const value = (column: string) =>
    op.filters.find((f) => f.column === column)?.value as string | undefined;

  if (op.table === failingTable) return { error: { message: 'connection reset' } };
  if (op.table === 'games') return { data: GAMES[value('id') ?? ''] ?? null };
  if (op.table === 'users') return { data: { is_admin: value('id') === ADMIN } };
  if (op.table === 'game_players' && op.single) {
    // `gameRefreshAccess`: kalleren sin aktive rad, eller ingenting.
    const row = (ROSTERS[value('game_id') ?? ''] ?? []).find(
      (p) => p.user_id === value('user_id') && p.withdrawn_at === null,
    );
    return { data: row ? { user_id: row.user_id } : null };
  }
  if (op.table === 'game_players') {
    return { data: ROSTERS[value('game_id') ?? ''] ?? [] };
  }
  throw new Error(`uventet spørring: ${op.kind} ${op.table}`);
}

const fake = createAdminClientMock({
  tokens: { [VALID_TOKEN]: TOKEN_USER_ID },
  respond: (op) => respond(op),
});

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => fake.client,
}));

const {
  authenticatedUserId,
  gameOrganiserAccess,
  scorecardReviewAccess,
  gameRefreshAccess,
} = await import('./appAuth');

/** `[tabell, kolonne, verdi]` per oppslag, i rekkefølge. */
const selects = () =>
  fake.ops.map((op) => [op.table, op.filters[0]?.column, op.filters[0]?.value]);

/** En request med akkurat de headerne testen bryr seg om. */
function request(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name === 'authorization' ? (authorization ?? null) : null,
    },
  } as unknown as Parameters<typeof authenticatedUserId>[0];
}

beforeEach(() => {
  fake.reset();
  failingTable = null;
});

describe('authenticatedUserId', () => {
  it('gir id-en fra det validerte tokenet', async () => {
    expect(await authenticatedUserId(request(`Bearer ${VALID_TOKEN}`))).toBe(
      TOKEN_USER_ID,
    );
    expect(fake.getUserCalls).toEqual([VALID_TOKEN]);
  });

  it('avviser et token GoTrue ikke godtar', async () => {
    expect(await authenticatedUserId(request('Bearer utløpt'))).toBeNull();
    expect(fake.getUserCalls).toEqual(['utløpt']);
  });

  it.each([
    ['uten header', undefined],
    ['med feil skjema', 'Basic abc'],
    ['med tom Bearer', 'Bearer    '],
  ])('svarer null %s — og spør aldri GoTrue', async (_label, header) => {
    expect(await authenticatedUserId(request(header))).toBeNull();
    // Negativt bevis: en request uten brukbart token skal ikke koste en rundtur.
    expect(fake.getUserCalls).toEqual([]);
  });
});

describe('gameOrganiserAccess', () => {
  it('slipper inn den som opprettet runden', async () => {
    expect(await gameOrganiserAccess(CREATOR, GAME)).toBe('organiser');
    // Oppretteren avgjøres av spill-raden alene — ingen rolle-oppslag trengs.
    expect(selects()).toEqual([['games', 'id', GAME]]);
  });

  it('slipper inn en klubb-admin som ikke opprettet runden', async () => {
    expect(await gameOrganiserAccess(ADMIN, GAME)).toBe('organiser');
    expect(selects()).toEqual([
      ['games', 'id', GAME],
      ['users', 'id', ADMIN],
    ]);
  });

  it('avviser en spiller som hverken er admin eller oppretter', async () => {
    expect(await gameOrganiserAccess(STRANGER, GAME)).toBe('not_organiser');
  });

  it('svarer ukjent spill — også for en admin, så 404-en ikke røper rollen', async () => {
    expect(await gameOrganiserAccess(ADMIN, 'finnes-ikke')).toBe(
      'game_not_found',
    );
    // Stopper på spill-oppslaget: rollen spørres aldri om for et spill som
    // ikke finnes.
    expect(selects()).toEqual([['games', 'id', 'finnes-ikke']]);
  });
});

describe('scorecardReviewAccess (#2215)', () => {
  // Porten er hele tilgangssjekken for ruta: kjernen skriver med service-role,
  // så vakt-triggerne og RLS slipper alt gjennom. Hver rad under er et
  // tilfelle ruta ellers ville sluppet igjennom eller stengt feil.
  it.each([
    { navn: 'samme flight godkjenner', caller: MATE, game: GAME, player: OWNER, decision: 'approve', svar: 'peer' },
    { navn: 'samme flight avviser', caller: MATE, game: GAME, player: OWNER, decision: 'reject', svar: 'peer' },
    // Én flight: oppretteren som selv spiller er attestant FØR hun er arrangør.
    { navn: 'én-flight-spill der oppretteren spiller', caller: CREATOR, game: SMALL_GAME, player: OWNER, decision: 'approve', svar: 'peer' },
    // Samme rekkefølge for admin: attestant FØR admin-grenen, ellers leser
    // varselet «Arrangøren» når en medspiller som tilfeldigvis er admin godkjenner.
    { navn: 'admin som spiller i samme flight godkjenner', caller: ADMIN, game: SMALL_GAME, player: OWNER, decision: 'approve', svar: 'peer' },
    { navn: 'oppretter utenfor flighten godkjenner', caller: CREATOR, game: GAME, player: FAR, decision: 'approve', svar: 'organizer' },
    { navn: 'oppretter utenfor flighten avviser', caller: CREATOR, game: GAME, player: FAR, decision: 'reject', svar: 'forbidden' },
    { navn: 'admin utenfor rosteret godkjenner', caller: ADMIN, game: GAME, player: FAR, decision: 'approve', svar: 'organizer' },
    { navn: 'admin utenfor rosteret avviser', caller: ADMIN, game: GAME, player: FAR, decision: 'reject', svar: 'organizer' },
    { navn: 'oppretter godkjenner egen rad', caller: CREATOR, game: GAME, player: CREATOR, decision: 'approve', svar: 'forbidden' },
    { navn: 'oppretter avviser egen rad', caller: CREATOR, game: GAME, player: CREATOR, decision: 'reject', svar: 'forbidden' },
    { navn: 'admin på egen rad', caller: ADMIN, game: GAME, player: ADMIN, decision: 'approve', svar: 'organizer' },
    { navn: 'fremmed godkjenner', caller: STRANGER, game: GAME, player: OWNER, decision: 'approve', svar: 'forbidden' },
    { navn: 'fremmed avviser', caller: STRANGER, game: GAME, player: OWNER, decision: 'reject', svar: 'forbidden' },
    { navn: 'trukket spiller godkjenner i egen flight', caller: WITHDRAWN, game: GAME, player: FAR, decision: 'approve', svar: 'forbidden' },
    // Åpne igjen: arrangøren, og bare arrangøren — også på egen rad (0159).
    { navn: 'oppretter åpner', caller: CREATOR, game: GAME, player: FAR, decision: 'reopen', svar: 'organizer' },
    { navn: 'admin åpner', caller: ADMIN, game: GAME, player: FAR, decision: 'reopen', svar: 'organizer' },
    { navn: 'medspiller som ikke er arrangør åpner', caller: MATE, game: GAME, player: OWNER, decision: 'reopen', svar: 'forbidden' },
    { navn: 'oppretter åpner egen rad', caller: CREATOR, game: GAME, player: CREATOR, decision: 'reopen', svar: 'organizer' },
    // #2200: den som leverte kortet, er ikke attestant for det. Vakta i 0191
    // stopper det under RLS, men ruta skriver med service-role, så porten må
    // gi samme svar. Samme regel for avvisning som på webbens /approve.
    { navn: 'den som leverte kortet, godkjenner det', caller: MATE, game: GAME, player: CARRIED, decision: 'approve', svar: 'forbidden' },
    { navn: 'den som leverte kortet, avviser det', caller: MATE, game: GAME, player: CARRIED, decision: 'reject', svar: 'forbidden' },
    { navn: 'en annen i flighten godkjenner et kort en makker leverte', caller: OWNER, game: GAME, player: CARRIED, decision: 'approve', svar: 'peer' },
    // Unntaket er vaktas: arrangøren og admin kan godkjenne et kort de leverte.
    { navn: 'oppretter i flighten godkjenner et kort hun leverte', caller: CREATOR, game: GAME, player: CARRIED_BY_CREATOR, decision: 'approve', svar: 'organizer' },
    { navn: 'admin i flighten godkjenner et kort hen leverte', caller: ADMIN, game: SMALL_GAME, player: MATE, decision: 'approve', svar: 'organizer' },
  ] as const)('$navn → $svar', async ({ caller, game, player, decision, svar }) => {
    const result = await scorecardReviewAccess(caller, game, player, decision);

    if (svar === 'forbidden') {
      expect(result).toEqual({ ok: false, reason: 'forbidden' });
    } else {
      expect(result).toEqual({
        ok: true,
        role: svar,
        gameMode: 'stableford',
        gameName: GAMES[game].name,
      });
    }
  });

  it.each(['approve', 'reject', 'reopen'] as const)(
    'runden er ikke i gang (%s) → not_active, før rollen spørres om',
    async (decision) => {
      expect(await scorecardReviewAccess(ADMIN, FINISHED_GAME, OWNER, decision)).toEqual({
        ok: false,
        reason: 'not_active',
      });
      expect(selects()).toEqual([['games', 'id', FINISHED_GAME]]);
    },
  );

  it.each([STRANGER, ADMIN])(
    'ukjent spill → game_not_found, også for %s',
    async (caller) => {
      expect(await scorecardReviewAccess(caller, 'finnes-ikke', OWNER, 'approve')).toEqual({
        ok: false,
        reason: 'game_not_found',
      });
      expect(selects()).toEqual([['games', 'id', 'finnes-ikke']]);
    },
  );

  it.each(['games', 'game_players', 'users'])(
    'en feilet lesing av %s kaster (ruta svarer 500) i stedet for å bli et nei',
    async (table) => {
      failingTable = table;

      // STRANGER går hele veien til admin-oppslaget, så alle tre lesingene nås.
      await expect(
        scorecardReviewAccess(STRANGER, GAME, OWNER, 'approve'),
      ).rejects.toThrow('connection reset');
    },
  );
});

describe('gameRefreshAccess (#2215)', () => {
  it.each([
    { navn: 'arrangøren', caller: CREATOR, svar: 'allowed' },
    { navn: 'admin', caller: ADMIN, svar: 'allowed' },
    { navn: 'en aktiv spiller som ikke er arrangør', caller: FAR, svar: 'allowed' },
    { navn: 'en trukket spiller', caller: WITHDRAWN, svar: 'forbidden' },
    { navn: 'en fremmed', caller: STRANGER, svar: 'forbidden' },
  ])('$navn → $svar', async ({ caller, svar }) => {
    expect(await gameRefreshAccess(caller, GAME)).toBe(svar);
  });

  it('medlemskapet slås opp på kalleren i DETTE spillet, bare aktive rader', async () => {
    await gameRefreshAccess(FAR, GAME);

    const membership = fake.ops.find((op) => op.table === 'game_players');
    expect(membership?.filters).toEqual([
      { op: 'eq', column: 'game_id', value: GAME },
      { op: 'eq', column: 'user_id', value: FAR },
      { op: 'is', column: 'withdrawn_at', value: null },
    ]);
  });

  it('en feilet medlemskaps-lesing kaster i stedet for å bli et nei', async () => {
    failingTable = 'game_players';

    await expect(gameRefreshAccess(FAR, GAME)).rejects.toThrow('connection reset');
  });

  it('ukjent spill → game_not_found, uten medlemskaps-oppslag', async () => {
    expect(await gameRefreshAccess(ADMIN, 'finnes-ikke')).toBe('game_not_found');
    expect(selects()).toEqual([['games', 'id', 'finnes-ikke']]);
  });
});
