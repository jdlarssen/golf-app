import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const playerRows = vi.fn<() => { data: Row[] | null }>();
const requestRows = vi.fn<() => { data: Row[] | null }>();
const openGamesRows = vi.fn<() => { data: Row[] | null }>();
const clubGamesRows = vi.fn<() => { data: Row[] | null }>();
const friendGamesRows = vi.fn<() => { data: Row[] | null }>();
const myClubsRows = vi.fn<() => { data: Row[] | null }>();
const notInArg = vi.fn();
const inArg = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'game_players') {
        return {
          select: () => ({
            eq: () => Promise.resolve(playerRows()),
          }),
        };
      }
      if (table === 'game_registration_requests') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve(requestRows()),
            }),
          }),
        };
      }
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => Promise.resolve(myClubsRows()),
          }),
        };
      }
      // games — same table backs three queries: club-scoped (first `.in` is
      // `group_id`), friend-scoped (first `.in` is `created_by`), and the
      // global open query (first `.in` is `registration_mode`).
      // A fresh closure per `from('games')` call lets us resolve the right
      // dataset by inspecting the first `.in` column.
      let firstInCol: string | null = null;
      const b: Record<string, unknown> = {
        select: () => b,
        in: (...args: unknown[]) => {
          if (firstInCol === null) firstInCol = args[0] as string;
          inArg(...args);
          return b;
        },
        neq: () => b,
        order: () => b,
        limit: () => b,
        not: (...args: unknown[]) => {
          notInArg(...args);
          return b;
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(
            firstInCol === 'group_id'
              ? clubGamesRows()
              : firstInCol === 'created_by'
                ? friendGamesRows()
                : openGamesRows(),
          ).then(resolve, reject),
      };
      return b;
    },
    // getFriendIds uses from('friendships') but that is mocked via the
    // @/lib/friends/getFriendIds module mock below.
  }),
}));

// getFriendIds is mocked at the module level so tests control which friend
// ids are returned without needing to replicate the friendships table logic.
const mockGetFriendIds = vi.fn<(userId: string) => Promise<string[]>>();
vi.mock('@/lib/friends/getFriendIds', () => ({
  getFriendIds: (userId: string) => mockGetFriendIds(userId),
}));

beforeEach(() => {
  playerRows.mockReset();
  requestRows.mockReset();
  openGamesRows.mockReset();
  clubGamesRows.mockReset();
  friendGamesRows.mockReset();
  myClubsRows.mockReset();
  notInArg.mockReset();
  inArg.mockReset();
  mockGetFriendIds.mockReset();
  // Defaults: no clubs, no club games, no friends — so #357 tests behave
  // exactly as before.
  myClubsRows.mockReturnValue({ data: [] });
  clubGamesRows.mockReturnValue({ data: [] });
  friendGamesRows.mockReturnValue({ data: [] });
  mockGetFriendIds.mockResolvedValue([]);
});

describe('getDiscoverableGames', () => {
  it('returnerer tomme lister når bruker ikke har data', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.clubGames).toEqual([]);
    expect(result.openGames).toEqual([]);
    expect(result.friendGames).toEqual([]);
    expect(result.pendingRequests).toEqual([]);
  });

  it('mapper open-game-rad til DiscoverableOpenGame med course-navn + modus', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Sommercup',
          short_id: 'k7m3p9qx',
          scheduled_tee_off_at: '2026-06-01T10:00:00Z',
          registration_mode: 'open',
          courses: { name: 'Hauger' },
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.openGames).toEqual([
      {
        id: 'g1',
        name: 'Sommercup',
        short_id: 'k7m3p9qx',
        scheduled_tee_off_at: '2026-06-01T10:00:00Z',
        course_name: 'Hauger',
        registration_mode: 'open',
      },
    ]);
  });

  it('query filtrerer på open + manual_approval (invite_only ekskluderes)', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    // Eksklusjon av invite_only er garantert av query-filteret, ikke av mock-en.
    expect(inArg).toHaveBeenCalledWith('registration_mode', [
      'open',
      'manual_approval',
    ]);
  });

  it('bevarer registration_mode per spill (open og manual_approval)', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'Åpen runde',
          short_id: 'open0001',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          courses: null,
        },
        {
          id: 'g2',
          name: 'Klubbmesterskap',
          short_id: 'appr0002',
          scheduled_tee_off_at: null,
          registration_mode: 'manual_approval',
          courses: null,
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.openGames.map((g) => g.registration_mode)).toEqual([
      'open',
      'manual_approval',
    ]);
  });

  it('ekskluderer spill bruker allerede er påmeldt', async () => {
    playerRows.mockReturnValue({ data: [{ game_id: 'g1' }, { game_id: 'g2' }] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g1'));
    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g2'));
  });

  it('ekskluderer også spill med pending/approved request', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g3',
          status: 'pending',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T12:00:00Z',
          games: { name: 'Klubbcup', short_id: 'abcd1234' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    expect(notInArg).toHaveBeenCalledWith('id', 'in', expect.stringContaining('g3'));
  });

  it('mapper pending request til PendingRequest-shape', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g3',
          status: 'pending',
          team_name: 'Skogen',
          is_team_captain: true,
          created_at: '2026-05-26T12:00:00Z',
          games: { name: 'Klubbcup', short_id: 'abcd1234' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.pendingRequests).toEqual([
      {
        id: 'r1',
        game_id: 'g3',
        short_id: 'abcd1234',
        game_name: 'Klubbcup',
        team_name: 'Skogen',
        is_team_captain: true,
        created_at: '2026-05-26T12:00:00Z',
      },
    ]);
  });

  it('inkluderer kun pending (ikke approved) i pendingRequests-listen', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({
      data: [
        {
          id: 'r1',
          game_id: 'g1',
          status: 'pending',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T10:00:00Z',
          games: { name: 'Spill A', short_id: 'aaaa1111' },
        },
        {
          id: 'r2',
          game_id: 'g2',
          status: 'approved',
          team_name: null,
          is_team_captain: false,
          created_at: '2026-05-26T11:00:00Z',
          games: { name: 'Spill B', short_id: 'bbbb2222' },
        },
      ],
    });
    openGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.pendingRequests).toHaveLength(1);
    expect(result.pendingRequests[0].id).toBe('r1');
  });

  // ── Klubb-scopet discovery (#442) ───────────────────────────────────────

  it('viser klubb-spill (også invite_only) for et medlem, med group_name', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    myClubsRows.mockReturnValue({ data: [{ group_id: 'c1' }] });
    clubGamesRows.mockReturnValue({
      data: [
        {
          id: 'cg1',
          name: 'Klubbrunde',
          short_id: 'club0001',
          scheduled_tee_off_at: '2026-06-10T08:00:00Z',
          registration_mode: 'invite_only',
          courses: { name: 'Bane' },
          groups: { name: 'Min Klubb' },
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.clubGames).toEqual([
      {
        id: 'cg1',
        name: 'Klubbrunde',
        short_id: 'club0001',
        scheduled_tee_off_at: '2026-06-10T08:00:00Z',
        course_name: 'Bane',
        registration_mode: 'invite_only',
        group_name: 'Min Klubb',
      },
    ]);
    // Klubb-spill spørres på medlemskapets group_id-er.
    expect(inArg).toHaveBeenCalledWith('group_id', ['c1']);
  });

  it('ekskluderer klubb-spill fra en utløpt klubb (frossen avtale, #50)', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    // Klubben utløp i fortiden → dens group_id filtreres bort før games-spørringen.
    myClubsRows.mockReturnValue({
      data: [{ group_id: 'c1', groups: { valid_until: '2020-01-01T00:00:00Z' } }],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.clubGames).toEqual([]);
    // Utløpt klubb → ingen group_id-spørring i det hele tatt.
    expect(inArg).not.toHaveBeenCalledWith('group_id', expect.anything());
  });

  it('gir ingen klubb-spill når brukeren ikke er medlem av noen klubb', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    myClubsRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.clubGames).toEqual([]);
    // Ingen klubb → ingen group_id-spørring.
    expect(inArg).not.toHaveBeenCalledWith('group_id', expect.anything());
  });

  it('deduper: et klubb-spill ekskluderes fra den globale open-lista', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    myClubsRows.mockReturnValue({ data: [{ group_id: 'c1' }] });
    clubGamesRows.mockReturnValue({
      data: [
        {
          id: 'dup1',
          name: 'Åpen klubbrunde',
          short_id: 'dup00001',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          courses: null,
          groups: { name: 'Min Klubb' },
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    // Klubb-spillets id legges til open-lista sin eksklusjon → vises kun én gang.
    expect(notInArg).toHaveBeenCalledWith(
      'id',
      'in',
      expect.stringContaining('dup1'),
    );
  });

  // ── Venn-discovery (#369) ────────────────────────────────────────────────

  it('venn-manual_approval-spill med let_friends_skip_gate=false → joinMode request', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    mockGetFriendIds.mockResolvedValue(['friend1']);
    friendGamesRows.mockReturnValue({
      data: [
        {
          id: 'fg1',
          name: 'Kompis-runde',
          short_id: 'frnd0001',
          scheduled_tee_off_at: '2026-07-01T09:00:00Z',
          registration_mode: 'manual_approval',
          let_friends_skip_gate: false,
          courses: { name: 'Bogstad' },
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.friendGames).toEqual([
      {
        id: 'fg1',
        name: 'Kompis-runde',
        short_id: 'frnd0001',
        scheduled_tee_off_at: '2026-07-01T09:00:00Z',
        course_name: 'Bogstad',
        registration_mode: 'manual_approval',
        joinMode: 'request',
      },
    ]);
  });

  it('venn-manual_approval-spill med let_friends_skip_gate=true → joinMode direct', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    mockGetFriendIds.mockResolvedValue(['friend1']);
    friendGamesRows.mockReturnValue({
      data: [
        {
          id: 'fg2',
          name: 'VIP-runde',
          short_id: 'frnd0002',
          scheduled_tee_off_at: null,
          registration_mode: 'manual_approval',
          let_friends_skip_gate: true,
          courses: null,
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.friendGames[0].joinMode).toBe('direct');
  });

  it('venn-invite_only-spill vises ikke i friendGames', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    mockGetFriendIds.mockResolvedValue(['friend1']);
    // invite_only filtreres allerede av query (.in registration_mode open/manual_approval)
    // — mock-en returnerer tomt for den spørringen
    friendGamesRows.mockReturnValue({ data: [] });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.friendGames).toEqual([]);
    // Bekrefter at query-filteret faktisk bruker registration_mode-listen
    expect(inArg).toHaveBeenCalledWith('registration_mode', [
      'open',
      'manual_approval',
    ]);
  });

  it('dedup: et venn-open-spill vises i friendGames og ikke i openGames', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    mockGetFriendIds.mockResolvedValue(['friend1']);
    friendGamesRows.mockReturnValue({
      data: [
        {
          id: 'fg3',
          name: 'Open venn-runde',
          short_id: 'frnd0003',
          scheduled_tee_off_at: null,
          registration_mode: 'open',
          let_friends_skip_gate: false,
          courses: null,
        },
      ],
    });

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    await getDiscoverableGames('u1');

    // Venn-spillets id legges til open-lista sin eksklusjon → vises kun én gang.
    expect(notInArg).toHaveBeenCalledWith(
      'id',
      'in',
      expect.stringContaining('fg3'),
    );
  });

  it('ingen venn-spill hentes når bruker ikke har venner', async () => {
    playerRows.mockReturnValue({ data: [] });
    requestRows.mockReturnValue({ data: [] });
    openGamesRows.mockReturnValue({ data: [] });
    mockGetFriendIds.mockResolvedValue([]);

    const { getDiscoverableGames } = await import('./getDiscoverableGames');
    const result = await getDiscoverableGames('u1');

    expect(result.friendGames).toEqual([]);
    // created_by-spørringen skal ikke ha blitt kalt
    expect(inArg).not.toHaveBeenCalledWith('created_by', expect.anything());
  });
});
