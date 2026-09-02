import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import { MAX_PERSONAL_CUP_MATCHES } from './limits';

/**
 * Gate-testene for kaptein-uttaket (#1884, SK4 + SK6).
 *
 * De nye tabellene er deny-by-default (0172: RLS på, ingen policyer), så
 * `loadCupLineupAccess` + `canWriteTeamLineup` ER håndhevelsen — det finnes
 * ingen policy bak som fanger en action som slipper noen forbi. Derfor testes
 * avvisningene her, ikke bare den rene regelen (som er dekket i
 * `captainRoles.test.ts`).
 *
 * Klient-oppsettet speiler `planActions.test.ts`: `supabaseMock` er den
 * request-scopede (kun `auth.getUser`), `adminMock` er service-role og svarer
 * på alt annet.
 *
 * Lese-sekvensen `loadCupLineupAccess` gjør for en personlig cup:
 *   1. tournaments.select('group_id, created_by').maybeSingle
 *   2. tournament_participants.select(...).order
 *   3. users.select('is_admin').maybeSingle — hoppes over når ingen er logget
 *      inn, og står derfor SIST, så rekkefølgen ikke flytter seg.
 */

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const notifyMock = vi.fn();
vi.mock('@/lib/notifications/events', () => ({
  notifyParticipantsCupLineupRevealed: (...a: unknown[]) => notifyMock(...a),
}));

const insertMatchesMock = vi.fn();
vi.mock('./insertCupMatches', async () => {
  const actual =
    await vi.importActual<typeof import('./insertCupMatches')>(
      './insertCupMatches',
    );
  return {
    ...actual,
    insertCupMatches: (...a: unknown[]) => insertMatchesMock(...a),
  };
});

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

const CUP = { data: { group_id: null, created_by: 'organizer' }, error: null };
const NOT_ADMIN = { data: { is_admin: false }, error: null };

/** cap1 kapteiner lag 1, cap2 lag 2, `pl` er en vanlig spiller på lag 1. */
const PARTICIPANTS = {
  data: [
    { user_id: 'organizer', team_number: null, is_captain: false },
    { user_id: 'cap1', team_number: 1, is_captain: true },
    { user_id: 'cap2', team_number: 2, is_captain: true },
    { user_id: 'pl', team_number: 1, is_captain: false },
    { user_id: 'pl2', team_number: 1, is_captain: false },
    { user_id: 'opp', team_number: 2, is_captain: false },
    { user_id: 'opp2', team_number: 2, is_captain: false },
  ],
  error: null,
};

/** Lesingene `loadCupLineupAccess` gjør for en personlig cup, i rekkefølge. */
function accessReads() {
  return [CUP, PARTICIPANTS, NOT_ADMIN];
}

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

/** Alle skrivinger adminMock så — brukes til «ingenting ble skrevet». */
function writeCalls() {
  return adminMock.__fromCalls.filter((c) =>
    ['insert', 'update', 'delete', 'upsert'].includes(c.method),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitCupLineup — hemmeligholdet på skrivesiden (SK4)', () => {
  it('kapteinen for lag 1 kan ikke levere for lag 2', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { submitCupLineup } = await import('./lineupActions');
    const res = await submitCupLineup(
      form({
        id: 'cup-1',
        session_id: 'sess-1',
        team: '2',
        slots: JSON.stringify([{ slotIndex: 0, userIds: ['opp', 'opp2'] }]),
      }),
    );

    expect(res).toEqual({ error: 'not_allowed' });
    // Avvist FØR økta i det hele tatt leses — ingen skriving, og ingen
    // lekkasje av at økta finnes.
    expect(writeCalls()).toHaveLength(0);
  });

  it('en vanlig deltaker kan ikke levere for sitt eget lag', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('pl');

    const { submitCupLineup } = await import('./lineupActions');
    const res = await submitCupLineup(
      form({
        id: 'cup-1',
        session_id: 'sess-1',
        team: '1',
        slots: JSON.stringify([{ slotIndex: 0, userIds: ['pl', 'pl2'] }]),
      }),
    );

    expect(res).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('en utlogget besøkende kan ikke levere', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });

    const { submitCupLineup } = await import('./lineupActions');
    expect(
      await submitCupLineup(
        form({ id: 'cup-1', session_id: 'sess-1', team: '1', slots: '[]' }),
      ),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('kapteinen leverer for eget lag: plassene lagres, ingen avdekking før motstanderen er inne', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      // Økta: foursomes, én plass, ingenting levert ennå.
      {
        data: {
          id: 'sess-1',
          format: 'foursomes_matchplay',
          slot_count: 1,
          revealed_at: null,
          team_1_submitted_at: null,
          team_2_submitted_at: null,
        },
        error: null,
      },
      { data: null, error: null }, // delete gammel kladd
      { data: null, error: null }, // insert plasser
      // Stemplingen: kun lag 1 er inne.
      {
        data: [{ team_1_submitted_at: 'now', team_2_submitted_at: null }],
        error: null,
      },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { submitCupLineup } = await import('./lineupActions');
    const res = await submitCupLineup(
      form({
        id: 'cup-1',
        session_id: 'sess-1',
        team: '1',
        slots: JSON.stringify([{ slotIndex: 0, userIds: ['pl', 'pl2'] }]),
      }),
    );

    expect(res).toEqual({ error: '' });
    // Ingen avdekking: motstanderen har ikke levert.
    expect(insertMatchesMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('kapteinen kan ikke levere en spiller fra motstanderlaget', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      {
        data: {
          id: 'sess-1',
          format: 'foursomes_matchplay',
          slot_count: 1,
          revealed_at: null,
          team_1_submitted_at: null,
          team_2_submitted_at: null,
        },
        error: null,
      },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { submitCupLineup } = await import('./lineupActions');
    const res = await submitCupLineup(
      form({
        id: 'cup-1',
        session_id: 'sess-1',
        team: '1',
        slots: JSON.stringify([{ slotIndex: 0, userIds: ['pl', 'opp'] }]),
      }),
    );

    expect(res).toEqual({ error: 'lineup_not_in_squad' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('en avdekket økt kan ikke leveres på nytt', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      {
        data: {
          id: 'sess-1',
          format: 'foursomes_matchplay',
          slot_count: 1,
          revealed_at: '2026-09-02T10:00:00.000Z',
          team_1_submitted_at: 'x',
          team_2_submitted_at: 'y',
        },
        error: null,
      },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { submitCupLineup } = await import('./lineupActions');
    expect(
      await submitCupLineup(
        form({
          id: 'cup-1',
          session_id: 'sess-1',
          team: '1',
          slots: JSON.stringify([{ slotIndex: 0, userIds: ['pl', 'pl2'] }]),
        }),
      ),
    ).toEqual({ error: 'lineup_revealed' });
    expect(writeCalls()).toHaveLength(0);
  });
});

describe('arrangør-only-handlingene (SK6)', () => {
  it('kapteinen kan ikke låse opp et levert uttak', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { unlockCupLineup } = await import('./lineupActions');
    expect(
      await unlockCupLineup(
        form({ id: 'cup-1', session_id: 'sess-1', team: '1' }),
      ),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('kapteinen kan ikke utnevne kapteiner', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { setCupParticipantRole } = await import('./lineupActions');
    expect(
      await setCupParticipantRole(
        form({ id: 'cup-1', user_id: 'pl', team: '1', is_captain: 'on' }),
      ),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('kapteinen kan ikke åpne en økt', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { openCupLineupSession } = await import('./lineupActions');
    expect(
      await openCupLineupSession(
        form({ id: 'cup-1', format: 'singles_matchplay', slot_count: '2' }),
      ),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('kapteinen kan ikke slette en økt', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { deleteCupLineupSession } = await import('./lineupActions');
    expect(
      await deleteCupLineupSession(form({ id: 'cup-1', session_id: 'sess-1' })),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('arrangøren kan levere på vegne av begge lag', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      {
        data: {
          id: 'sess-1',
          format: 'foursomes_matchplay',
          slot_count: 1,
          revealed_at: null,
          team_1_submitted_at: null,
          team_2_submitted_at: null,
        },
        error: null,
      },
      { data: null, error: null }, // delete
      { data: null, error: null }, // insert
      {
        data: [{ team_1_submitted_at: null, team_2_submitted_at: 'now' }],
        error: null,
      },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { submitCupLineup } = await import('./lineupActions');
    // Lag 2 — arrangøren er ikke kaptein for noen av lagene.
    expect(
      await submitCupLineup(
        form({
          id: 'cup-1',
          session_id: 'sess-1',
          team: '2',
          slots: JSON.stringify([{ slotIndex: 0, userIds: ['opp', 'opp2'] }]),
        }),
      ),
    ).toEqual({ error: '' });
  });
});


/**
 * #1902 — planlagt antall kamper og poengmålet.
 *
 * Lese-sekvensen `setCupPlannedMatchCount` gjør, etter `accessReads()`:
 *   4. tournaments.select('status').maybeSingle
 *   5. cup_lineup_sessions.select('slot_count, revealed_at')  ⎫ Promise.all
 *   6. games.select('id')                                     ⎭ gulvet
 *   7. tournaments.update({planned_match_count}).select('id')
 *   8–10. syncCupPointsToWin: tournaments.maybeSingle + games head/count + update
 */
describe('setCupPlannedMatchCount — planlagt antall kamper (#1902)', () => {
  const ACTIVE = { data: { status: 'active' }, error: null };
  const DRAFT = { data: { status: 'draft' }, error: null };

  /** Gulv-lesingene: ingen åpnede økter, `matches` eksisterende kamper. */
  function floorReads(matches: number) {
    return [
      { data: [], error: null },
      { data: Array.from({ length: matches }, (_, i) => ({ id: `g${i}` })), error: null },
    ];
  }

  /** Synk-helperens tre kall for en aktiv cup med `matches` kamper. */
  function syncReads(matches: number, planned: number | null) {
    return [
      {
        data: {
          status: 'active',
          planned_match_count: planned,
          win_points: 1,
          tie_points: 0.5,
        },
        error: null,
      },
      { count: matches },
      { data: [{ id: 'cup-1' }], error: null },
    ];
  }

  /** Verdiene som ble skrevet til `tournaments`, i rekkefølge. */
  function tournamentUpdates(): Record<string, unknown>[] {
    return adminMock.__fromCalls
      .filter((c) => c.table === 'tournaments' && c.method === 'update')
      .map((c) => c.args[0] as Record<string, unknown>);
  }

  it('kapteinen kan ikke sette planlagt antall', async () => {
    adminMock = buildSupabaseMock(accessReads());
    supabaseMock = buildSupabaseMock([]);
    setUser('cap1');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '28' }),
      ),
    ).toEqual({ error: 'not_allowed' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('et tall under gulvet avvises — og ingenting skrives', async () => {
    // Cupen har alt 6 kamper; arrangøren skriver 4.
    adminMock = buildSupabaseMock([...accessReads(), ACTIVE, ...floorReads(6)]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '4' }),
      ),
    ).toEqual({ error: 'lineup_planned_total' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('åpnede, ikke-avdekkede plasser teller med i gulvet', async () => {
    // 2 kamper + en åpnet økt med 3 plasser = gulv 5. Arrangøren skriver 4.
    adminMock = buildSupabaseMock([
      ...accessReads(),
      ACTIVE,
      { data: [{ slot_count: 3, revealed_at: null }], error: null },
      { data: [{ id: 'g0' }, { id: 'g1' }], error: null },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '4' }),
      ),
    ).toEqual({ error: 'lineup_planned_total' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('over det personlige match-taket avvises (#526/#1883)', async () => {
    adminMock = buildSupabaseMock([...accessReads(), ACTIVE, ...floorReads(2)]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({
          id: 'cup-1',
          planned_match_count: String(MAX_PERSONAL_CUP_MATCHES + 1),
        }),
      ),
    ).toEqual({ error: 'too_many_matches' });
    expect(writeCalls()).toHaveLength(0);
  });

  it('aktiv cup: planlagt lagres OG poengmålet flyttes med én gang', async () => {
    // 8 kamper spilt, 28 planlagt → målet skal bli 14,5 nå, ikke ved neste start.
    adminMock = buildSupabaseMock([
      ...accessReads(),
      ACTIVE,
      ...floorReads(8),
      { data: [{ id: 'cup-1' }], error: null },
      ...syncReads(8, 28),
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '28' }),
      ),
    ).toEqual({ error: '' });

    expect(tournamentUpdates()).toEqual([
      { planned_match_count: 28 },
      { points_to_win: 14.5 },
    ]);
  });

  it('draft: planlagt lagres, men målet røres ikke (#1142 står)', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      DRAFT,
      ...floorReads(0),
      { data: [{ id: 'cup-1' }], error: null },
      // Synken leser cupen, ser 'draft' og returnerer uten å skrive.
      {
        data: {
          status: 'draft',
          planned_match_count: 28,
          win_points: 1,
          tie_points: 0.5,
        },
        error: null,
      },
      { count: 0 },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '28' }),
      ),
    ).toEqual({ error: '' });

    // Kun planlagt — INGEN points_to_win. Målet utledes ved start.
    expect(tournamentUpdates()).toEqual([{ planned_match_count: 28 }]);
  });

  it('avsluttet cup: cup_finished, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      { data: { status: 'finished' }, error: null },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { setCupPlannedMatchCount } = await import('./lineupActions');
    expect(
      await setCupPlannedMatchCount(
        form({ id: 'cup-1', planned_match_count: '28' }),
      ),
    ).toEqual({ error: 'cup_finished' });
    expect(writeCalls()).toHaveLength(0);
  });
});

describe('openCupLineupSession — første økt krever planlagt antall (#1902)', () => {
  /** Cup-raden `openCupLineupSession` leser før den åpner. */
  function cupRow(planned: number | null, win = 1, tie = 0.5) {
    return {
      data: {
        status: 'active',
        planned_match_count: planned,
        win_points: win,
        tie_points: tie,
      },
      error: null,
    };
  }

  it('planlagt NULL på en default-vektet cup → lineup_planned_total_missing', async () => {
    adminMock = buildSupabaseMock([...accessReads(), cupRow(null)]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { openCupLineupSession } = await import('./lineupActions');
    expect(
      await openCupLineupSession(
        form({ id: 'cup-1', format: 'singles_matchplay', slot_count: '2' }),
      ),
    ).toEqual({ error: 'lineup_planned_total_missing' });
    // Feiler LUKKET: gaten er server-side, ikke bare en disabled knapp.
    expect(writeCalls()).toHaveLength(0);
  });

  it('vektet cup slipper spørsmålet helt (#1441 D8)', async () => {
    // Splittet cup-dag (seier 5, delt 2) har ikke noe «først til X» — et
    // planlagt antall ville ikke endret noe, så det kreves ikke.
    adminMock = buildSupabaseMock([
      ...accessReads(),
      cupRow(null, 5, 2),
      { data: [], error: null }, // sessions
      { data: [], error: null }, // games
      { data: null, error: null }, // insert
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { openCupLineupSession } = await import('./lineupActions');
    expect(
      await openCupLineupSession(
        form({ id: 'cup-1', format: 'singles_matchplay', slot_count: '2' }),
      ),
    ).toEqual({ error: '' });
    expect(
      adminMock.__fromCalls.filter(
        (c) => c.table === 'cup_lineup_sessions' && c.method === 'insert',
      ),
    ).toHaveLength(1);
  });

  it('planlagt satt → økta åpnes som før', async () => {
    adminMock = buildSupabaseMock([
      ...accessReads(),
      cupRow(28),
      { data: [], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('organizer');

    const { openCupLineupSession } = await import('./lineupActions');
    expect(
      await openCupLineupSession(
        form({ id: 'cup-1', format: 'singles_matchplay', slot_count: '2' }),
      ),
    ).toEqual({ error: '' });
  });
});


/**
 * #1902 SK6 — sikkerhetsnettet ved avdekking.
 *
 * Avdekkingen når `submitCupLineup` får det andre uttaket inn. Blir det da
 * flere kamper enn arrangøren planla, skal målet flytte seg opp av seg selv:
 * planlagt er et gulv, ikke et tak.
 *
 * Kø-en er lang fordi hele avdekkings-stien går gjennom mock-en. Rekkefølgen:
 *   1–3.  accessReads()
 *   4.    cup_lineup_sessions.maybeSingle          (økta submit leser)
 *   5.    cup_lineup_slots.delete
 *   6.    cup_lineup_slots.insert
 *   7.    cup_lineup_sessions.update (stempel)     → begge inne ⇒ avdekk
 *   8.    tournaments.maybeSingle    ⎫ loadRevealContext
 *   9.    tournament_plans.maybeSingle ⎬
 *   10.   tee_boxes.maybeSingle       ⎬
 *   11.   cup_lineup_sessions.maybeSingle ⎭
 *   12.   cup_lineup_slots.select                  (begge lags plasser)
 *   13.   tournament_participants.select           (stallene nå)
 *   14.   cup_lineup_sessions.update (klem revealed_at)
 *   15.   games.select('game_mode')                (neste labelnummer)
 *   16–18. syncCupPointsToWin                     (sikkerhetsnettet)
 *   19.   tournament_participants.select           (varsel-mottakere)
 */
describe('revealCupLineupSession — målet følger med når kampene kommer (#1902)', () => {
  const TEE = {
    data: {
      course_id: 'course-1',
      archived_at: null,
      slope_mens: 113,
      course_rating_mens: 70,
      par_total_mens: 72,
      slope_ladies: 113,
      course_rating_ladies: 70,
      par_total_ladies: 72,
      slope_juniors: null,
      course_rating_juniors: null,
      par_total_juniors: null,
    },
    error: null,
  };

  /** Køen fram til og med varsel-lesingen, for en 1-plass singel-økt. */
  function revealQueue() {
    return [
      ...accessReads(),
      {
        data: {
          id: 'sess-1',
          format: 'singles_matchplay',
          slot_count: 1,
          revealed_at: null,
          team_1_submitted_at: 'now',
          team_2_submitted_at: null,
        },
        error: null,
      },
      { data: null, error: null }, // slots delete
      { data: null, error: null }, // slots insert
      {
        data: [{ team_1_submitted_at: 'now', team_2_submitted_at: 'now' }],
        error: null,
      },
      // loadRevealContext
      {
        data: {
          name: 'Ryder Cup',
          status: 'active',
          group_id: null,
          created_by: 'organizer',
          fourball_allowance_pct: null,
          foursomes_allowance_pct: null,
          greensome_allowance_pct: null,
          chapman_allowance_pct: null,
          gruesome_allowance_pct: null,
        },
        error: null,
      },
      {
        data: {
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: null,
          best_ball_allowance_pct: null,
        },
        error: null,
      },
      TEE,
      { data: { format: 'singles_matchplay', slot_count: 1 }, error: null },
      // begge lags lagrede plasser
      {
        data: [
          { team_number: 1, slot_index: 0, seat: 1, user_id: 'pl' },
          { team_number: 2, slot_index: 0, seat: 1, user_id: 'opp' },
        ],
        error: null,
      },
      PARTICIPANTS, // stallene slik de er nå
      { data: [{ id: 'sess-1' }], error: null }, // klem revealed_at
      { data: [], error: null }, // games (labelnummer)
      // …og her, FØR varselet, kaller koden syncCupPointsToWin.
    ];
  }

  /** Varsel-mottakerne, lest etter synken. */
  const NOTIFY_RECIPIENTS = { data: [{ user_id: 'pl' }], error: null };

  /** Synk-helperens tre kall. */
  function syncQueue(matches: number, planned: number | null) {
    return [
      {
        data: {
          status: 'active',
          planned_match_count: planned,
          win_points: 1,
          tie_points: 0.5,
        },
        error: null,
      },
      { count: matches },
      { data: [{ id: 'cup-1' }], error: null },
    ];
  }

  function submitForm() {
    return form({
      id: 'cup-1',
      session_id: 'sess-1',
      team: '2',
      slots: JSON.stringify([{ slotIndex: 0, userIds: ['opp'] }]),
    });
  }

  function pointsWritten(): unknown[] {
    return adminMock.__fromCalls
      .filter((c) => c.table === 'tournaments' && c.method === 'update')
      .map((c) => (c.args[0] as { points_to_win?: unknown }).points_to_win);
  }

  it('faktisk passerer planlagt → målet regnes av faktisk antall', async () => {
    // Planlagt 4, men avdekkingen har brakt cupen opp i 6 kamper → 3,5.
    adminMock = buildSupabaseMock([
      ...revealQueue(),
      ...syncQueue(6, 4),
      NOTIFY_RECIPIENTS,
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap2');
    insertMatchesMock.mockResolvedValue({ ok: true });

    const { submitCupLineup } = await import('./lineupActions');
    expect(await submitCupLineup(submitForm())).toEqual({ error: '' });
    expect(pointsWritten()).toEqual([3.5]);
  });

  it('faktisk under planlagt → målet står der arrangøren satte det', async () => {
    // Planlagt 28, bare 8 kamper avdekket → fortsatt 14,5.
    adminMock = buildSupabaseMock([
      ...revealQueue(),
      ...syncQueue(8, 28),
      NOTIFY_RECIPIENTS,
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap2');
    insertMatchesMock.mockResolvedValue({ ok: true });

    const { submitCupLineup } = await import('./lineupActions');
    expect(await submitCupLineup(submitForm())).toEqual({ error: '' });
    expect(pointsWritten()).toEqual([14.5]);
  });

  it('synken feiler → kampene står, avdekkingen svarer OK, feilen logges', async () => {
    // Den ene bevisste best-effort-lomma: kampene er viktigere enn tallet, og
    // neste avdekking (eller en ny lagring av planlagt antall) synker på nytt.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminMock = buildSupabaseMock([
      ...revealQueue(),
      { data: null, error: { message: 'boom' } }, // synkens cup-lesing feiler
      NOTIFY_RECIPIENTS,
    ]);
    supabaseMock = buildSupabaseMock([]);
    setUser('cap2');
    insertMatchesMock.mockResolvedValue({ ok: true });

    const { submitCupLineup } = await import('./lineupActions');
    expect(await submitCupLineup(submitForm())).toEqual({ error: '' });
    expect(errorSpy).toHaveBeenCalledWith(
      '[cup] revealCupLineupSession points sync failed',
      expect.objectContaining({ tournamentId: 'cup-1' }),
    );
    errorSpy.mockRestore();
  });
});
