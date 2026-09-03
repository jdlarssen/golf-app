import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';

/**
 * #1814 — trekk underveis i en cup. Konvoluttregelen selv (halvert / walkover /
 * fourball-unntaket) er uttømmende dekket av `cupWithdrawalOutcome.test.ts`;
 * denne suiten dekker det som BARE finnes i handlingene: at riktig rader
 * skrives, at aktive og ferdige kamper aldri røres, at fourball-valget lander i
 * `mode_config`, at angre kun nuller de ikke-startede, og at gatene avviser
 * feil cup-status og ikke-deltakere.
 *
 * Mock-rigg speilet fra `actions.test.ts`: gaten leser `tournaments.group_id`
 * på admin-klienten og rollen på request-klienten, deretter er alt admin.
 */

const redirectMock = makeRedirectMock();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/i18n/revalidateLocalePath', () => ({
  revalidatePath: vi.fn(),
}));

let supabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => supabaseMock,
}));

let adminMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminMock,
}));

const CUP = 'cup-1';
const PLAYER = 'p1';
const ADMIN = 'admin-1';

/** Gatens to lesninger for en frittstående cup med en global admin. */
const gateGroupIdNull = { data: { group_id: null }, error: null };
const cupAdminUser = {
  data: { is_admin: true, email: 'a@x.no', name: 'Admin' },
  error: null,
};

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = buildSupabaseMock([cupAdminUser]);
  setUser(ADMIN);
});

function game(
  id: string,
  status: 'draft' | 'scheduled' | 'active' | 'finished',
  game_mode = 'singles_matchplay',
  mode_config: unknown = { kind: game_mode, team_size: 1, teams_count: 2 },
) {
  return { id, status, game_mode, mode_config, created_at: `2026-09-0${id.at(-1)}` };
}

function playerRow(game_id: string, withdrawn_at: string | null = null) {
  return { game_id, withdrawn_at };
}

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Handlingenes tre faste lesninger: gate → games → spillerens rader. */
function reads(opts: {
  status?: 'draft' | 'active' | 'finished';
  games?: unknown[];
  rows?: unknown[];
}) {
  return [
    { data: { id: CUP, status: opts.status ?? 'active', group_id: null }, error: null },
    { data: opts.games ?? [], error: null },
    { data: opts.rows ?? [], error: null },
  ];
}

function updates(table: string) {
  return adminMock.__fromCalls.filter(
    (c) => c.table === table && c.method === 'update',
  );
}

describe('withdrawCupPlayer — hvilke kamper som flagges (#1814)', () => {
  it('flagger ALLE ikke-startede kamper og ingen aktive eller ferdige', async () => {
    adminMock = buildSupabaseMock([
      // Gaten leser først group_id på admin-klienten.
      gateGroupIdNull,
      ...reads({
        games: [
          game('g1', 'finished'),
          game('g2', 'active'),
          game('g3', 'scheduled'),
          game('g4', 'draft'),
        ],
        rows: [
          playerRow('g1'),
          playerRow('g2'),
          playerRow('g3'),
          playerRow('g4'),
        ],
      }),
      { data: [{ user_id: PLAYER }], error: null }, // flagg g3
      { data: [{ user_id: PLAYER }], error: null }, // flagg g4
      {
        data: [
          { id: 'g3', status: 'scheduled' },
          { id: 'g4', status: 'draft' },
        ],
        error: null,
      }, // TOCTOU-re-lesing
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    const err = await withdrawCupPlayer(
      form({ tournament_id: CUP, user_id: PLAYER }),
    ).catch((e) => e);

    expect(err, 'suksess redirecter (kaster)').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe(`/admin/cup/${CUP}?status=player_withdrawn`);

    const rowWrites = updates('game_players');
    expect(rowWrites).toHaveLength(2);
    for (const call of rowWrites) {
      const payload = call.args[0] as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual([
        'withdrawn_at',
        'withdrawn_by_user_id',
      ]);
      expect(payload.withdrawn_by_user_id).toBe(ADMIN);
      expect(typeof payload.withdrawn_at).toBe('string');
    }
    // Ingen mode_config-skriving uten fourball-valg.
    expect(updates('games')).toHaveLength(0);
  });

  it('hopper over en kamp som rakk å starte mellom lesing og skriving, og nuller den', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [game('g1', 'scheduled'), game('g2', 'scheduled')],
        rows: [playerRow('g1'), playerRow('g2')],
      }),
      { data: [{ user_id: PLAYER }], error: null },
      { data: [{ user_id: PLAYER }], error: null },
      {
        data: [
          { id: 'g1', status: 'scheduled' },
          { id: 'g2', status: 'active' }, // cron rakk å starte den
        ],
        error: null,
      },
      { data: null, error: null }, // kompenserende nulling av g2
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    const err = await withdrawCupPlayer(
      form({ tournament_id: CUP, user_id: PLAYER }),
    ).catch((e) => e);

    // Resten står — kun den ene kampen rulles tilbake.
    expect((err as RedirectError).url).toBe(
      `/admin/cup/${CUP}?status=player_withdrawn_partial`,
    );
    const rowWrites = updates('game_players');
    expect(rowWrites).toHaveLength(3);
    expect(rowWrites[2].args[0]).toEqual({
      withdrawn_at: null,
      withdrawn_by_user_id: null,
    });
  });

  it('skriver withdrawal_play_on på den valgte fourball-kampen — og bare den', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [
          game('g1', 'scheduled', 'fourball_matchplay', {
            kind: 'fourball_matchplay',
            team_size: 2,
            teams_count: 2,
            allowance_pct: 90,
          }),
          game('g2', 'scheduled', 'fourball_matchplay'),
        ],
        rows: [playerRow('g1'), playerRow('g2')],
      }),
      { data: [{ user_id: PLAYER }], error: null }, // flagg g1
      { data: [{ id: 'g1' }], error: null }, // mode_config g1
      { data: [{ user_id: PLAYER }], error: null }, // flagg g2
      {
        data: [
          { id: 'g1', status: 'scheduled' },
          { id: 'g2', status: 'scheduled' },
        ],
        error: null,
      },
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    await withdrawCupPlayer(
      form({ tournament_id: CUP, user_id: PLAYER, play_on_game_ids: 'g1' }),
    ).catch(() => {});

    const configWrites = updates('games');
    expect(configWrites).toHaveLength(1);
    // Merge, aldri erstatt: allowance_pct og kind må overleve.
    expect(configWrites[0].args[0]).toEqual({
      mode_config: {
        kind: 'fourball_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 90,
        withdrawal_play_on: true,
      },
    });
  });

  it('ignorerer et play_on-valg på en modus som ikke har alene-varianten', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [game('g1', 'scheduled', 'foursomes_matchplay')],
        rows: [playerRow('g1')],
      }),
      { data: [{ user_id: PLAYER }], error: null },
      { data: [{ id: 'g1', status: 'scheduled' }], error: null },
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    await withdrawCupPlayer(
      form({ tournament_id: CUP, user_id: PLAYER, play_on_game_ids: 'g1' }),
    ).catch(() => {});

    expect(updates('games')).toHaveLength(0);
  });
});

describe('withdrawCupPlayer — gatene (#1814)', () => {
  it.each(['draft', 'finished'] as const)(
    'cup-status %s → wrong_status, ingen skriving',
    async (status) => {
      adminMock = buildSupabaseMock([gateGroupIdNull, ...reads({ status })]);

      const { withdrawCupPlayer } = await import('./withdrawalActions');
      expect(
        await withdrawCupPlayer(form({ tournament_id: CUP, user_id: PLAYER })),
      ).toEqual({ error: 'wrong_status' });
      expect(updates('game_players')).toHaveLength(0);
      expect(redirectMock).not.toHaveBeenCalled();
    },
  );

  it('spiller uten rader i cupen → not_participant', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({ games: [game('g1', 'scheduled')], rows: [] }),
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    expect(
      await withdrawCupPlayer(form({ tournament_id: CUP, user_id: PLAYER })),
    ).toEqual({ error: 'not_participant' });
  });

  it('kun aktive/ferdige kamper igjen → no_pending_matches, ingen skriving', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [game('g1', 'active'), game('g2', 'finished')],
        rows: [playerRow('g1'), playerRow('g2')],
      }),
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    expect(
      await withdrawCupPlayer(form({ tournament_id: CUP, user_id: PLAYER })),
    ).toEqual({ error: 'no_pending_matches' });
    expect(updates('game_players')).toHaveLength(0);
  });

  it('alt trukket fra før → no_pending_matches (idempotent, ingen dobbel-skriving)', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [game('g1', 'scheduled')],
        rows: [playerRow('g1', '2026-09-09T20:00:00.000Z')],
      }),
    ]);

    const { withdrawCupPlayer } = await import('./withdrawalActions');
    expect(
      await withdrawCupPlayer(form({ tournament_id: CUP, user_id: PLAYER })),
    ).toEqual({ error: 'no_pending_matches' });
  });
});

describe('withdrawSelfFromCup (#1814)', () => {
  it('skriver seg selv som withdrawn_by og lander på cup-siden', async () => {
    supabaseMock = buildSupabaseMock([]);
    setUser(PLAYER);
    adminMock = buildSupabaseMock([
      ...reads({ games: [game('g1', 'scheduled')], rows: [playerRow('g1')] }),
      { data: [{ user_id: PLAYER }], error: null },
      { data: [{ id: 'g1', status: 'scheduled' }], error: null },
    ]);

    const { withdrawSelfFromCup } = await import('./withdrawalActions');
    const err = await withdrawSelfFromCup(form({ tournament_id: CUP })).catch((e) => e);

    expect((err as RedirectError).url).toBe(`/cup/${CUP}?status=withdrawn`);
    expect(updates('game_players')[0].args[0]).toMatchObject({
      withdrawn_by_user_id: PLAYER,
    });
  });

  it('setter aldri fourball-valget — det er arrangørens (E4)', async () => {
    supabaseMock = buildSupabaseMock([]);
    setUser(PLAYER);
    adminMock = buildSupabaseMock([
      ...reads({
        games: [game('g1', 'scheduled', 'fourball_matchplay')],
        rows: [playerRow('g1')],
      }),
      { data: [{ user_id: PLAYER }], error: null },
      { data: [{ id: 'g1', status: 'scheduled' }], error: null },
    ]);

    const { withdrawSelfFromCup } = await import('./withdrawalActions');
    await withdrawSelfFromCup(form({ tournament_id: CUP })).catch(() => {});
    expect(updates('games')).toHaveLength(0);
  });

  it('utlogget → not_authed uten å røre DB-en', async () => {
    supabaseMock = buildSupabaseMock([]);
    (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null },
    });
    adminMock = buildSupabaseMock([]);

    const { withdrawSelfFromCup } = await import('./withdrawalActions');
    expect(await withdrawSelfFromCup(form({ tournament_id: CUP }))).toEqual({
      error: 'not_authed',
    });
    expect(adminMock.__fromCalls).toHaveLength(0);
  });
});

describe('undoCupWithdrawal (#1814)', () => {
  it('nuller KUN de ikke-startede kampene og fjerner play-on-flagget der', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({
        games: [
          game('g1', 'active'),
          game('g2', 'scheduled', 'fourball_matchplay', {
            kind: 'fourball_matchplay',
            team_size: 2,
            teams_count: 2,
            withdrawal_play_on: true,
          }),
        ],
        rows: [
          playerRow('g1', '2026-09-09T20:00:00.000Z'),
          playerRow('g2', '2026-09-09T20:00:00.000Z'),
        ],
      }),
      { data: [{ user_id: PLAYER }], error: null }, // nulling g2
      { data: [{ id: 'g2' }], error: null }, // mode_config g2
    ]);

    const { undoCupWithdrawal } = await import('./withdrawalActions');
    const err = await undoCupWithdrawal(
      form({ tournament_id: CUP, user_id: PLAYER }),
    ).catch((e) => e);

    expect((err as RedirectError).url).toBe(
      `/admin/cup/${CUP}?status=withdrawal_undone`,
    );
    const rowWrites = updates('game_players');
    expect(rowWrites).toHaveLength(1);
    expect(rowWrites[0].args[0]).toEqual({
      withdrawn_at: null,
      withdrawn_by_user_id: null,
    });
    // Flagget forsvinner helt, resten av mode_config står.
    expect(updates('games')[0].args[0]).toEqual({
      mode_config: {
        kind: 'fourball_matchplay',
        team_size: 2,
        teams_count: 2,
      },
    });
  });

  it('spiller som ikke er trukket → not_withdrawn', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      ...reads({ games: [game('g1', 'scheduled')], rows: [playerRow('g1')] }),
    ]);

    const { undoCupWithdrawal } = await import('./withdrawalActions');
    expect(
      await undoCupWithdrawal(form({ tournament_id: CUP, user_id: PLAYER })),
    ).toEqual({ error: 'not_withdrawn' });
  });
});

describe('setFourballWithdrawalChoice (#1814)', () => {
  const FOURBALL = {
    id: 'g1',
    tournament_id: CUP,
    status: 'scheduled',
    game_mode: 'fourball_matchplay',
    mode_config: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 },
  };

  it('slår på flagget for en fourball med en trukket rad og en makker igjen', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: FOURBALL, error: null },
      {
        data: [
          { user_id: 'a1', team_number: 1, withdrawn_at: '2026-09-09T20:00:00.000Z' },
          { user_id: 'a2', team_number: 1, withdrawn_at: null },
          { user_id: 'b1', team_number: 2, withdrawn_at: null },
          { user_id: 'b2', team_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
      { data: [{ id: 'g1' }], error: null },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    const err = await setFourballWithdrawalChoice(
      form({ tournament_id: CUP, game_id: 'g1', play_on: '1' }),
    ).catch((e) => e);

    expect((err as RedirectError).url).toBe(`/admin/cup/${CUP}?status=play_on_saved`);
    expect(updates('games')[0].args[0]).toEqual({
      mode_config: {
        kind: 'fourball_matchplay',
        team_size: 2,
        teams_count: 2,
        withdrawal_play_on: true,
      },
    });
  });

  it('avviser en kamp fra en annen cup', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { ...FOURBALL, tournament_id: 'cup-2' }, error: null },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    expect(
      await setFourballWithdrawalChoice(
        form({ tournament_id: CUP, game_id: 'g1', play_on: '1' }),
      ),
    ).toEqual({ error: 'not_found' });
  });

  it.each([
    ['startet kamp', { status: 'active' }],
    ['annen modus', { game_mode: 'foursomes_matchplay' }],
  ])('avviser %s → match_not_eligible', async (_name, overrides) => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: { ...FOURBALL, ...overrides }, error: null },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    expect(
      await setFourballWithdrawalChoice(
        form({ tournament_id: CUP, game_id: 'g1', play_on: '1' }),
      ),
    ).toEqual({ error: 'match_not_eligible' });
  });

  it('avviser en kamp uten trekk — flagget ville ikke betydd noe', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: FOURBALL, error: null },
      {
        data: [
          { user_id: 'a1', team_number: 1, withdrawn_at: null },
          { user_id: 'b1', team_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    expect(
      await setFourballWithdrawalChoice(
        form({ tournament_id: CUP, game_id: 'g1', play_on: '1' }),
      ),
    ).toEqual({ error: 'match_not_eligible' });
  });

  it('avviser når HELE siden har trukket seg — ingen ball igjen å slå', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      { data: FOURBALL, error: null },
      {
        data: [
          { user_id: 'a1', team_number: 1, withdrawn_at: '2026-09-09T20:00:00.000Z' },
          { user_id: 'a2', team_number: 1, withdrawn_at: '2026-09-09T20:00:00.000Z' },
          { user_id: 'b1', team_number: 2, withdrawn_at: null },
        ],
        error: null,
      },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    expect(
      await setFourballWithdrawalChoice(
        form({ tournament_id: CUP, game_id: 'g1', play_on: '1' }),
      ),
    ).toEqual({ error: 'match_not_eligible' });
  });

  it('fjerner flagget igjen når arrangøren ombestemmer seg', async () => {
    adminMock = buildSupabaseMock([
      gateGroupIdNull,
      {
        data: {
          ...FOURBALL,
          mode_config: { ...FOURBALL.mode_config, withdrawal_play_on: true },
        },
        error: null,
      },
      {
        data: [
          { user_id: 'a1', team_number: 1, withdrawn_at: '2026-09-09T20:00:00.000Z' },
          { user_id: 'a2', team_number: 1, withdrawn_at: null },
        ],
        error: null,
      },
      { data: [{ id: 'g1' }], error: null },
    ]);

    const { setFourballWithdrawalChoice } = await import('./withdrawalActions');
    await setFourballWithdrawalChoice(
      form({ tournament_id: CUP, game_id: 'g1', play_on: '0' }),
    ).catch(() => {});

    expect(updates('games')[0].args[0]).toEqual({
      mode_config: { kind: 'fourball_matchplay', team_size: 2, teams_count: 2 },
    });
  });
});
