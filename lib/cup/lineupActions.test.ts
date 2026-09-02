import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

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
