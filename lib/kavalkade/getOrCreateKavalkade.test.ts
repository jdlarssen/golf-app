import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Systemgrensene: databasen, innlasteren og språkmodellen. Fakta-byggeren
// kjører ekte, så formen som lagres er den K1 faktisk lager.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: { message: string } | null };

let kavalkadeRead: Result;
let kavalkadeUpsert: Result;
let adminRead: Result;

const upsertSpy = vi.fn();
const readSpy = vi.fn();
const adminLookupSpy = vi.fn();

// Lesingen går med SERVICE-rollen, altså med RLS av. Da er filtrene i koden
// den eneste tingen som holder én spillers tall unna en annen, så mocken
// skriver ned hvert `.eq()` og testene assererer på dem.
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: (columns: string) => ({
            eq: (column: string, value: unknown) => ({
              maybeSingle: async () => {
                adminLookupSpy({ columns, filters: { [column]: value } });
                return adminRead;
              },
            }),
          }),
        };
      }
      return {
        select: (columns: string) => {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return builder;
            },
            maybeSingle: async () => {
              readSpy({ columns, filters: { ...filters } });
              return kavalkadeRead;
            },
          };
          return builder;
        },
        upsert: (values: unknown, options: unknown) => {
          upsertSpy(values, options);
          return {
            select: () => ({ returns: async () => kavalkadeUpsert }),
          };
        },
      };
    },
  }),
}));

const loadKavalkadeInputMock = vi.fn();
vi.mock('./loadKavalkadeInput', () => ({
  loadKavalkadeInput: (...args: unknown[]) => loadKavalkadeInputMock(...args),
}));

const generateNarrativeMock = vi.fn();
vi.mock('./generateKavalkadeNarrative', () => ({
  generateKavalkadeNarrative: (...args: unknown[]) => generateNarrativeMock(...args),
}));

import { getOrCreateKavalkade } from './getOrCreateKavalkade';
import { KAVALKADE_CUTOFF, KAVALKADE_YEAR } from './release';

const VIEWER = '11111111-1111-1111-1111-111111111111';
const BEFORE = new Date(KAVALKADE_CUTOFF.getTime() - 1);
const AFTER = new Date(KAVALKADE_CUTOFF.getTime() + 1);
// Tom for at overstyringen ikke skal kunne flytte åpningen under test.
const ENV = {};

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    facts: { year: KAVALKADE_YEAR, rounds: 7 },
    narrative: 'Året ditt ble langt.',
    generated_at: '2026-12-24T09:00:00.000Z',
    ...overrides,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // reset, ikke clear: kappløps-testen setter en implementasjon på readSpy som
  // ellers ville lekt videre inn i de neste testene.
  vi.resetAllMocks();
  kavalkadeRead = { data: null, error: null };
  kavalkadeUpsert = { data: [], error: null };
  adminRead = { data: { is_admin: false }, error: null };
  loadKavalkadeInputMock.mockResolvedValue({
    viewerUserId: VIEWER,
    year: KAVALKADE_YEAR,
    cutoff: KAVALKADE_CUTOFF,
    games: [],
  });
  generateNarrativeMock.mockResolvedValue('Året ditt ble langt.');
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('før frysegrensen', () => {
  it('gir vanlige spillere «kommer», uten å skrive eller kalle modellen', async () => {
    const view = await getOrCreateKavalkade(VIEWER, { now: BEFORE, env: ENV });

    expect(view).toEqual({
      status: 'closed',
      opensAt: KAVALKADE_CUTOFF.toISOString(),
    });
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(generateNarrativeMock).not.toHaveBeenCalled();
    expect(loadKavalkadeInputMock).not.toHaveBeenCalled();
  });

  it('lar admin forhåndsvise fakta — uten tekst og uten lagring', async () => {
    adminRead = { data: { is_admin: true }, error: null };

    const view = await getOrCreateKavalkade(VIEWER, { now: BEFORE, env: ENV });

    expect(view.status).toBe('preview');
    if (view.status !== 'preview') throw new Error('forventet preview');
    expect(view.facts.year).toBe(KAVALKADE_YEAR);
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(generateNarrativeMock).not.toHaveBeenCalled();
  });

  it('leser admin-oppslaget fail-closed', async () => {
    adminRead = { data: null, error: { message: 'boom' } };

    const view = await getOrCreateKavalkade(VIEWER, { now: BEFORE, env: ENV });

    expect(view.status).toBe('closed');
  });

  it('spør om admin-flagget for den innloggede spilleren, ikke for noen andre', async () => {
    await getOrCreateKavalkade(VIEWER, { now: BEFORE, env: ENV });

    expect(adminLookupSpy).toHaveBeenCalledWith({
      columns: 'is_admin',
      filters: { id: VIEWER },
    });
  });

  it('regner forhåndsvisningen mot frysegrensen, ikke mot «nå»', async () => {
    adminRead = { data: { is_admin: true }, error: null };

    await getOrCreateKavalkade(VIEWER, { now: BEFORE, env: ENV });

    expect(loadKavalkadeInputMock).toHaveBeenCalledWith(VIEWER, {
      year: KAVALKADE_YEAR,
      cutoff: KAVALKADE_CUTOFF,
    });
  });
});

describe('etter frysegrensen', () => {
  it('returnerer den lagrede raden uten å kalle modellen igjen', async () => {
    kavalkadeRead = { data: storedRow(), error: null };

    const view = await getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV });

    expect(view).toEqual({
      status: 'ready',
      facts: { year: KAVALKADE_YEAR, rounds: 7 },
      narrative: 'Året ditt ble langt.',
      generatedAt: '2026-12-24T09:00:00.000Z',
    });
    expect(generateNarrativeMock).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('bygger, skriver og returnerer ved første åpning', async () => {
    kavalkadeUpsert = { data: [storedRow()], error: null };

    const view = await getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV });

    expect(view.status).toBe('ready');
    expect(generateNarrativeMock).toHaveBeenCalledTimes(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);

    const [values, options] = upsertSpy.mock.calls[0];
    // Fakta som lagres er nøyaktig dem fakta-byggeren lagde av det innlasteren
    // ga — ikke et utdrag, og ikke noe annet års tall.
    expect(values).toEqual({
      user_id: VIEWER,
      year: KAVALKADE_YEAR,
      narrative: 'Året ditt ble langt.',
      facts: {
        year: KAVALKADE_YEAR,
        cutoff: KAVALKADE_CUTOFF.toISOString(),
        rounds: 0,
        soloRounds: 0,
        teamRounds: 0,
        roundsNeeded: 3,
        personal: null,
        team: null,
        gang: null,
      },
    });
    // «on conflict do nothing» — to faner gir én rad.
    expect(options).toEqual({ onConflict: 'user_id,year', ignoreDuplicates: true });
  });

  // RLS er av på denne lesingen. Et glemt eller feil filter ville gitt én
  // spiller en annens kavalkade, og ingen policy ville stoppet det.
  it('leser raden på BÅDE spiller og år', async () => {
    kavalkadeRead = { data: storedRow(), error: null };

    await getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV, year: 2026 });

    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(readSpy.mock.calls[0][0].filters).toEqual({
      user_id: VIEWER,
      year: 2026,
    });
  });

  it('lagrer null som tekst når modellen ikke svarte', async () => {
    generateNarrativeMock.mockResolvedValue(null);
    kavalkadeUpsert = { data: [storedRow({ narrative: null })], error: null };

    const view = await getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV });

    expect(view.status).toBe('ready');
    if (view.status !== 'ready') throw new Error('forventet ready');
    expect(view.narrative).toBeNull();
    expect(upsertSpy.mock.calls[0][0]).toMatchObject({ narrative: null });
  });

  it('bruker raden vinneren skrev når to faner kappes', async () => {
    kavalkadeUpsert = { data: [], error: null };
    readSpy.mockImplementation(() => {
      // Andre lesing: vinnerens rad finnes nå.
      if (readSpy.mock.calls.length >= 2) kavalkadeRead = { data: storedRow(), error: null };
    });

    const view = await getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV });

    expect(view.status).toBe('ready');
    expect(readSpy).toHaveBeenCalledTimes(2);
  });

  // Felle 2: 0 rader uten konflikt er en feil, ikke stille suksess.
  it('kaster når skrivingen traff null rader og ingen rad finnes', async () => {
    kavalkadeUpsert = { data: [], error: null };

    await expect(getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV })).rejects.toThrow(
      /affected 0 rows/,
    );
  });

  it('kaster på skrivefeil', async () => {
    kavalkadeUpsert = { data: null, error: { message: 'nei' } };

    await expect(getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV })).rejects.toThrow(
      /insert failed: nei/,
    );
  });

  // #877: en defaultet lesefeil ville blitt til «ingen rad» — og dermed en ny
  // generering oppå en rad som allerede finnes.
  it('kaster på lesefeil i stedet for å generere på nytt', async () => {
    kavalkadeRead = { data: null, error: { message: 'nede' } };

    await expect(getOrCreateKavalkade(VIEWER, { now: AFTER, env: ENV })).rejects.toThrow(
      /read failed: nede/,
    );
    expect(generateNarrativeMock).not.toHaveBeenCalled();
  });
});

describe('KAVALKADE_OPEN_AT', () => {
  it('åpner tidlig på staging', async () => {
    kavalkadeRead = { data: storedRow(), error: null };

    const view = await getOrCreateKavalkade(VIEWER, {
      now: new Date('2026-10-01T00:00:00Z'),
      env: { KAVALKADE_OPEN_AT: '2026-09-01T00:00:00Z' },
    });

    expect(view.status).toBe('ready');
  });

  it('ignoreres i produksjon', async () => {
    const view = await getOrCreateKavalkade(VIEWER, {
      now: new Date('2026-10-01T00:00:00Z'),
      env: { KAVALKADE_OPEN_AT: '2026-09-01T00:00:00Z', VERCEL_ENV: 'production' },
    });

    expect(view.status).toBe('closed');
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
