// native/app/src/data/createGame.test.ts
// Opprett-flyten: rekkefølge, kolonnesett og — viktigst — hva som skjer når
// noe går galt.
//
// Tre feller har hvert sitt navn her, og alle tre har blødd i prod før:
//   • 0-rads-inserten (#667/#704) — `error == null` er ikke suksess.
//   • den foreldreløse runden (#737) — feiler spiller-inserten, MÅ games-raden
//     slettes igjen.
//   • kompensasjonen som selv feiler — da kan raden stå der, og arrangøren må
//     få vite det i stedet for et «prøv igjen» som lager runde nummer to.
//
// `routeFrom` kaster på en spørring ingen har rigget. Det brukes med vilje som
// assertion: en test som IKKE nevner `games` beviser at porten foran skrev
// ingenting.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { toOsloDateTimeLocal, type GameDraft } from '../lib/wizardPayload';
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

type Mocks = typeof import('../test/supabaseMock');
type CreateGame = typeof import('./createGame');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function createGame(): CreateGame {
  return require('./createGame') as CreateGame;
}

const ME = 'user-me';
const MATE = 'user-mate';
const GAME_ID = 'game-new';

const inDays = (days: number): string =>
  toOsloDateTimeLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

function draft(over: Partial<GameDraft> = {}): GameDraft {
  return {
    name: 'Torsdagsrunden',
    gameMode: 'stableford',
    courseId: 'course-1',
    teeBoxId: 'tee-1',
    teeOffLocal: inDays(1),
    players: [
      { userId: ME, teeGender: 'M', teamNumber: null },
      { userId: MATE, teeGender: 'D', teamNumber: null },
    ],
    ...over,
  };
}

const ACTIVE_FORMAT = { data: { slug: 'stableford' }, error: null };
const GAME_ROW = { data: [{ id: GAME_ID }], error: null };
const PLAYER_ROWS = { data: [{ user_id: ME }, { user_id: MATE }], error: null };
/** PostgREST når RLS avviser raden. */
const RLS_ERROR = { data: null, error: { message: 'nektet', code: '42501' } };
/** Den lumske: ingen feil, men heller ingen rad. */
const ZERO_ROWS = { data: [], error: null };

describe('publishGame', () => {
  useFreshModules();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    // Ingen på lista mangler profil.
    mocks().supabase.rpc.mockResolvedValue({ data: [], error: null });
  });

  describe('gullstien', () => {
    it('skriver webbens kolonnesett på games og gir id-en tilbake', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const gameInsert = queryStub(GAME_ROW);
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [gameInsert],
        game_players: [queryStub(PLAYER_ROWS)],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: true,
        gameId: GAME_ID,
      });

      const row = stepArgs(gameInsert, 'insert')[0]![0] as Record<string, unknown>;
      expect(row).toMatchObject({
        name: 'Torsdagsrunden',
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        game_mode: 'stableford',
        mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
        // Publisering gir 'scheduled', aldri 'active' — runden startes for seg.
        status: 'scheduled',
        created_by: ME,
        started_at: null,
        registration_mode: 'invite_only',
        entry_fee_kr: 0,
        payment_link: null,
        prizes: [],
        side_tournament_enabled: false,
        side_ld_count: 0,
        side_ctp_count: 0,
        side_disabled_categories: [],
        group_id: null,
        tournament_id: null,
      });
      expect(typeof row.scheduled_tee_off_at).toBe('string');
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      expect(stepArgs(gameInsert, 'select')).toEqual([['id']]);
    });

    // #463: din egen rad er bekreftet, de andres er «Ikke bekreftet» til de
    // selv sier ja. Regelen er delt kode (`acceptedAtForActor`).
    it('bekrefter din egen rad og lar de andre stå ubekreftet', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const playerInsert = queryStub(PLAYER_ROWS);
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(GAME_ROW)],
        game_players: [playerInsert],
      });

      await createGame().publishGame(draft());

      const rows = stepArgs(playerInsert, 'insert')[0]![0] as Record<
        string,
        unknown
      >[];
      expect(rows).toHaveLength(2);
      expect(typeof rows[0]!.accepted_at).toBe('string');
      expect(rows[1]!.accepted_at).toBeNull();
    });

    it('bærer tee-kjønn per spiller og lar banehandicapet stå åpent', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const playerInsert = queryStub(PLAYER_ROWS);
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(GAME_ROW)],
        game_players: [playerInsert],
      });

      await createGame().publishGame(draft());

      const rows = stepArgs(playerInsert, 'insert')[0]![0] as Record<
        string,
        unknown
      >[];
      expect(rows[0]).toMatchObject({
        game_id: GAME_ID,
        user_id: ME,
        tee_gender: 'mens',
        team_number: null,
        flight_number: null,
        // Fryses ved start (D5), ikke ved opprettelse.
        course_handicap: null,
      });
      expect(rows[1]).toMatchObject({ user_id: MATE, tee_gender: 'ladies' });
    });

    it('sender lag-numrene videre for en lag-modus', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const playerInsert = queryStub({ data: [{ user_id: 'a' }], error: null });
      routeFrom({
        formats: [queryStub({ data: { slug: 'best_ball' }, error: null })],
        games: [queryStub(GAME_ROW)],
        game_players: [playerInsert],
      });

      await createGame().publishGame(
        draft({
          gameMode: 'best_ball',
          players: [
            { userId: 'a', teeGender: 'M', teamNumber: 1 },
            { userId: 'b', teeGender: 'M', teamNumber: 2 },
            { userId: 'c', teeGender: 'M', teamNumber: 1 },
            { userId: 'd', teeGender: 'M', teamNumber: 2 },
          ],
        }),
      );

      const rows = stepArgs(playerInsert, 'insert')[0]![0] as Record<
        string,
        unknown
      >[];
      expect(rows.map((r) => [r.user_id, r.team_number, r.flight_number])).toEqual([
        ['a', 1, 1],
        ['c', 1, 1],
        ['b', 2, 1],
        ['d', 2, 1],
      ]);
    });

    it('skriver sideturneringens slots når bryteren står på', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const gameInsert = queryStub(GAME_ROW);
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [gameInsert],
        game_players: [queryStub(PLAYER_ROWS)],
      });

      await createGame().publishGame(
        draft({ sideTournamentEnabled: true, sideLdCount: 1, sideCtpCount: 2 }),
      );

      expect(stepArgs(gameInsert, 'insert')[0]![0]).toMatchObject({
        side_tournament_enabled: true,
        side_ld_count: 1,
        side_ctp_count: 2,
        side_disabled_categories: [],
      });
    });
  });

  describe('portene foran skrivingen', () => {
    it('nekter uten sesjon, uten å røre databasen', async () => {
      const { routeFrom } = mocks();
      mocks().currentDeviceUserId.mockResolvedValue(null);
      routeFrom({});

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'not_authenticated',
      });
    });

    it('sender den delte byggerens valideringskode videre', async () => {
      const { routeFrom } = mocks();
      routeFrom({});

      // Ingen spillere → `min_players_for_mode` fra den delte validatoren.
      expect(await createGame().publishGame(draft({ players: [] }))).toEqual({
        ok: false,
        error: 'min_players_for_mode',
      });
    });

    it('stopper et format appen ikke har skjermer for, før DB-en spørres', async () => {
      const { routeFrom } = mocks();
      routeFrom({});

      expect(
        await createGame().publishGame(
          draft({ gameMode: 'patsome' as GameDraft['gameMode'] }),
        ),
      ).toEqual({ ok: false, error: 'unsupported_mode' });
    });

    it('stopper et format admin har slått av', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ formats: [queryStub({ data: null, error: null })] });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'invalid_game_mode',
      });
    });

    // Feil ≠ fravær: «vi fikk ikke sjekket» er «prøv igjen», ikke «velg noe
    // annet». Webben slår de to sammen; midt i en opprettelse er de ulike svar.
    it('skiller en feilet format-sjekk fra et ugyldig format', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub({ data: null, error: { message: 'timeout' } })],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'db_format',
      });
    });

    it('nekter en tee-off i fortiden, og skriver ingenting', async () => {
      const { queryStub, routeFrom } = mocks();
      // `games` og `game_players` er utelatt: berøres de, kaster mocken.
      routeFrom({ formats: [queryStub(ACTIVE_FORMAT)] });

      expect(
        await createGame().publishGame(draft({ teeOffLocal: inDays(-1) })),
      ).toEqual({ ok: false, error: 'tee_off_in_past' });
    });

    it('krever et tee-off-tidspunkt', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ formats: [queryStub(ACTIVE_FORMAT)] });

      expect(await createGame().publishGame(draft({ teeOffLocal: null }))).toEqual({
        ok: false,
        error: 'tee_off_required',
      });
    });

    it('nekter en LD-teller utenfor 0–2', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ formats: [queryStub(ACTIVE_FORMAT)] });

      expect(
        await createGame().publishGame(
          draft({
            sideTournamentEnabled: true,
            sideLdCount: 5 as GameDraft['sideLdCount'],
          }),
        ),
      ).toEqual({ ok: false, error: 'bad_side_ld_count' });
    });

    it('blokkerer publisering når noen mangler profil', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      supabase.rpc.mockResolvedValue({ data: [{ id: MATE }], error: null });
      routeFrom({ formats: [queryStub(ACTIVE_FORMAT)] });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'pending_players',
      });
      expect(supabase.rpc).toHaveBeenCalledWith('incomplete_profiles_for_ids', {
        p_user_ids: [ME, MATE],
      });
    });

    it('skiller en feilet roster-sjekk fra en uferdig profil', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      supabase.rpc.mockResolvedValue({ data: null, error: { message: 'nede' } });
      routeFrom({ formats: [queryStub(ACTIVE_FORMAT)] });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'db_roster',
      });
    });
  });

  describe('skrivefeil', () => {
    // #667/#704 i ren form: PostgREST svarer `error == null` på en INSERT som
    // traff 0 rader. Uten `expectAffected` ville dette blitt meldt som suksess.
    it('melder 0-rads-inserten som feil, ikke som suksess', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(ZERO_ROWS)],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'no_rows',
      });
    });

    it('gir RLS-avvisningen sin egen kode', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(RLS_ERROR)],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'rls_denied',
      });
    });

    it('gir «prøv igjen» på en vanlig DB-feil', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub({ data: null, error: { message: 'timeout' } })],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'db_game',
      });
    });
  });

  describe('kompenserende sletting (#737)', () => {
    it('sletter games-raden når spiller-inserten feiler', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const compensate = queryStub({ data: [{ id: GAME_ID }], error: null });
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(GAME_ROW), compensate],
        game_players: [queryStub({ data: null, error: { message: 'nei' } })],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'db_players',
      });

      // Slettingen SKJEDDE, og den traff nøyaktig den nye raden.
      expect(stepArgs(compensate, 'delete')).toHaveLength(1);
      expect(stepArgs(compensate, 'eq')).toEqual([['id', GAME_ID]]);
      // …og den er selv trap-2-sikret.
      expect(stepArgs(compensate, 'select')).toEqual([['id']]);
    });

    it('kompenserer også når 0115-triggeren avviser en spiller', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const compensate = queryStub({ data: [{ id: GAME_ID }], error: null });
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(GAME_ROW), compensate],
        game_players: [queryStub(RLS_ERROR)],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'rls_denied',
      });
      expect(stepArgs(compensate, 'delete')).toHaveLength(1);
    });

    // Den ærlige raden: feiler slettingen også, KAN games-raden stå igjen.
    // Et «prøv igjen» her ville laget runde nummer to ved siden av den tomme.
    it('sier fra når kompensasjonen selv feiler', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [
          queryStub(GAME_ROW),
          queryStub({ data: null, error: { message: 'også nede' } }),
        ],
        game_players: [queryStub({ data: null, error: { message: 'nei' } })],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'orphan_game',
      });
    });

    it('sier fra når slettingen traff 0 rader', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        formats: [queryStub(ACTIVE_FORMAT)],
        games: [queryStub(GAME_ROW), queryStub(ZERO_ROWS)],
        game_players: [queryStub({ data: null, error: { message: 'nei' } })],
      });

      expect(await createGame().publishGame(draft())).toEqual({
        ok: false,
        error: 'orphan_game',
      });
    });
  });
});

describe('fetchRosterCandidates', () => {
  useFreshModules();

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'u-1',
    name: 'Kari',
    nickname: null,
    hcp_index: '12.4',
    gender: 'D',
    profile_completed_at: '2026-01-01T00:00:00Z',
    is_guest: false,
    ...over,
  });

  it('mapper til camelCase og tallfester handicapet', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ users: [queryStub({ data: [row()], error: null })] });

    expect(await createGame().fetchRosterCandidates()).toEqual([
      {
        id: 'u-1',
        name: 'Kari',
        nickname: null,
        hcpIndex: 12.4,
        gender: 'D',
        pending: false,
      },
    ]);
  });

  it('filtrerer bort anonymiserte kontoer i spørringen', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const read = queryStub({ data: [], error: null });
    routeFrom({ users: [read] });

    await createGame().fetchRosterCandidates();
    expect(stepArgs(read, 'is')).toEqual([['deleted_at', null]]);
  });

  // Gjeste-rader MÅ inn via service-role (0115). Å tilby en spiller hvis
  // insert er dømt til å feile ville vært uærlig.
  it('utelater gjester, men beholder rader uten flagg', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: [
            row({ id: 'ekte' }),
            row({ id: 'gjest', is_guest: true }),
            row({ id: 'uflagget', is_guest: null }),
          ],
          error: null,
        }),
      ],
    });

    expect((await createGame().fetchRosterCandidates()).map((c) => c.id)).toEqual([
      'ekte',
      'uflagget',
    ]);
  });

  it('markerer en uferdig profil', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [queryStub({ data: [row({ profile_completed_at: null })], error: null })],
    });

    expect((await createGame().fetchRosterCandidates())[0]!.pending).toBe(true);
  });

  it('kaster ved feilet henting — tom liste er et annet svar', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ users: [queryStub({ data: null, error: { message: 'nede' } })] });

    await expect(createGame().fetchRosterCandidates()).rejects.toThrow('nede');
  });
});

describe('fetchCourses', () => {
  useFreshModules();

  const tee = (over: Record<string, unknown> = {}) => ({
    id: 'tee-1',
    name: 'Gul',
    archived_at: null,
    slope_mens: 120,
    course_rating_mens: 70,
    par_total_mens: 72,
    slope_ladies: 118,
    course_rating_ladies: 72,
    par_total_ladies: null,
    slope_juniors: null,
    course_rating_juniors: null,
    par_total_juniors: null,
    ...over,
  });

  it('utleder hvilke tee-kjønn teen har rating for', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      courses: [
        queryStub({
          data: [{ id: 'c-1', name: 'Losby', tee_boxes: [tee()] }],
          error: null,
        }),
      ],
    });

    expect(await createGame().fetchCourses()).toEqual([
      {
        id: 'c-1',
        name: 'Losby',
        tees: [
          {
            id: 'tee-1',
            name: 'Gul',
            hasMens: true,
            // Par mangler → banehandicapet kan ikke regnes ut for dame.
            hasLadies: false,
            hasJuniors: false,
          },
        ],
      },
    ]);
  });

  // `courses` har ingen arkiv-kolonne; kun teene kan arkiveres, og filteret
  // må derfor gjøres på den nøstede raden — som på web.
  it('filtrerer bort arkiverte teer, men beholder banen', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      courses: [
        queryStub({
          data: [
            {
              id: 'c-1',
              name: 'Losby',
              tee_boxes: [
                tee({ id: 'gammel', archived_at: '2026-01-01T00:00:00Z' }),
                tee({ id: 'ny', name: 'Blå' }),
              ],
            },
          ],
          error: null,
        }),
      ],
    });

    const [course] = await createGame().fetchCourses();
    expect(course!.tees.map((t) => t.id)).toEqual(['ny']);
  });

  it('takler en bane uten teer', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      courses: [
        queryStub({ data: [{ id: 'c-1', name: 'Losby', tee_boxes: null }], error: null }),
      ],
    });

    expect((await createGame().fetchCourses())[0]!.tees).toEqual([]);
  });

  it('kaster ved feilet henting', async () => {
    const { queryStub, routeFrom } = mocks();
    routeFrom({ courses: [queryStub({ data: null, error: { message: 'nede' } })] });

    await expect(createGame().fetchCourses()).rejects.toThrow('nede');
  });
});
