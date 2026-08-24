import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSupabaseMock,
  makeLocaleRedirectMock,
  RedirectError,
} from '@/tests/serverActionMocks';
import type { CupJoinContext } from '@/lib/cup/getCupJoinContext';

/**
 * Unit-tester for joinCup / leaveCup (#1490) — spillerens selvpåmelding via
 * delbar lenke.
 *
 * `getCupJoinContext` mockes på grensen (samme grep som planActions.test.ts
 * bruker for `getCupCandidatePlayers`): fakta-innsamlingen er I/O og dekkes av
 * flyten på staging, mens beslutningen den mater dekkes uttømmende av
 * `joinValidation.test.ts`. Her testes det actionen selv eier — at ingenting
 * skrives før vakten sier ja, at skrivingen er scopet til egen rad, og at
 * varselet er best-effort.
 *
 * `adminMock`-køen holder derfor kun actionens EGNE kall: skrivingen først,
 * deretter navne-oppslaget `notifyCreator` gjør.
 */

const redirectMock = makeLocaleRedirectMock();
vi.mock('@/i18n/navigation', () => ({
  redirect: (arg: { href: string; locale?: string }) => redirectMock(arg),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'no',
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

const contextMock = vi.fn();
vi.mock('@/lib/cup/getCupJoinContext', () => ({
  getCupJoinContext: (...args: unknown[]) => contextMock(...args),
}));

const notifyMock = vi.fn();
vi.mock('@/lib/notifications/notify', () => ({
  notify: (...args: unknown[]) => notifyMock(...args),
}));

const ME = 'player-1';
const CREATOR = 'creator-1';

function setUser(id: string) {
  (supabaseMock.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { user: { id, email: `${id}@x.no` } },
  });
}

/** Åpen draft-cup der `ME` kan melde seg på. Overrides bryter én ting. */
function context(overrides: {
  cup?: Partial<CupJoinContext['cup']>;
  facts?: Partial<CupJoinContext['facts']>;
} = {}): CupJoinContext {
  return {
    cup: {
      id: 'cup-1',
      name: 'Vinter-cup',
      status: 'draft',
      group_id: null,
      created_by: CREATOR,
      team_1_name: 'Lag A',
      team_2_name: 'Lag B',
      ...overrides.cup,
    },
    facts: {
      cupExists: true,
      status: 'draft',
      groupId: null,
      creatorIsAdmin: false,
      profileCompleted: true,
      isClubMember: false,
      participantCount: 2,
      alreadyJoined: false,
      ...overrides.facts,
    },
  };
}

function form(shortId = 'abcd1234'): FormData {
  const fd = new FormData();
  fd.set('short_id', shortId);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMock = buildSupabaseMock([]);
  setUser(ME);
  notifyMock.mockResolvedValue({ shouldAlsoSendMail: false });
});

describe('joinCup', () => {
  it('happy path: upserter egen deltakerrad, varsler skaperen, redirecter til bekreftelsen', async () => {
    adminMock = buildSupabaseMock([
      { data: null, error: null }, // upsert
      { data: { name: 'Kari Nord', nickname: null }, error: null }, // notify-navn
    ]);
    contextMock.mockResolvedValue(context());

    const { joinCup } = await import('./actions');
    const err = await joinCup(form()).catch((e) => e);

    expect(err, 'suksess redirecter (kaster)').toBeInstanceOf(RedirectError);
    expect((err as RedirectError).url).toBe('/cup/bli-med/abcd1234?status=joined');

    const upsert = adminMock.__fromCalls.find(
      (c) => c.table === 'tournament_participants' && c.method === 'upsert',
    );
    expect(upsert!.args[0]).toEqual({ tournament_id: 'cup-1', user_id: ME });
    expect(upsert!.args[1]).toEqual({
      onConflict: 'tournament_id,user_id',
      ignoreDuplicates: true,
    });

    expect(notifyMock).toHaveBeenCalledWith({
      userId: CREATOR,
      kind: 'cup_signup',
      payload: {
        tournament_id: 'cup-1',
        tournament_name: 'Vinter-cup',
        group_id: null,
        participant_name: 'Kari Nord',
        action: 'joined',
      },
    });

    const { revalidateTag } = await import('next/cache');
    expect(revalidateTag).toHaveBeenCalledWith('tournament-cup-1', 'max');
  });

  it('avvist av vakten: ingen skriving, ingen redirect, feilkoden ut', async () => {
    adminMock = buildSupabaseMock([]);
    contextMock.mockResolvedValue(
      context({ facts: { participantCount: 999 } }), // over taket
    );

    const { joinCup } = await import('./actions');
    expect(await joinCup(form())).toEqual({ error: 'full' });
    expect(
      adminMock.__fromCalls.some((c) => c.table === 'tournament_participants'),
    ).toBe(false);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('allerede påmeldt: stille no-op til bekreftelses-tilstanden, ingen skriving', async () => {
    adminMock = buildSupabaseMock([]);
    contextMock.mockResolvedValue(context({ facts: { alreadyJoined: true } }));

    const { joinCup } = await import('./actions');
    const err = await joinCup(form()).catch((e) => e);

    expect((err as RedirectError).url).toBe('/cup/bli-med/abcd1234');
    expect(
      adminMock.__fromCalls.some((c) => c.method === 'upsert'),
    ).toBe(false);
  });

  it('skaperen melder seg på sin egen cup: ingen selv-varsel, og bekreftelsen sier det ikke', async () => {
    adminMock = buildSupabaseMock([{ data: null, error: null }]); // kun upsert
    contextMock.mockResolvedValue(context());
    setUser(CREATOR);

    const { joinCup } = await import('./actions');
    const err = await joinCup(form()).catch((e) => e);

    expect(notifyMock).not.toHaveBeenCalled();
    // Egen status-kode ⇒ eget banner: «vi sa fra til arrangøren» ville vært
    // usant her, siden varselet over aldri ble sendt.
    expect((err as RedirectError).url).toBe(
      '/cup/bli-med/abcd1234?status=joined_self',
    );
  });
});

describe('leaveCup', () => {
  it('happy path: sletter EGEN rad og varsler skaperen', async () => {
    adminMock = buildSupabaseMock([
      { data: null, error: null }, // delete
      { data: { name: 'Kari Nord', nickname: 'Kaia' }, error: null },
    ]);
    contextMock.mockResolvedValue(context({ facts: { alreadyJoined: true } }));

    const { leaveCup } = await import('./actions');
    const err = await leaveCup(form()).catch((e) => e);

    expect((err as RedirectError).url).toBe('/cup/bli-med/abcd1234?status=left');

    expect(
      adminMock.__fromCalls.some(
        (c) => c.table === 'tournament_participants' && c.method === 'delete',
      ),
    ).toBe(true);
    // Selve vernet: slettingen er filtrert på den innloggede brukerens egen id,
    // så en spiller aldri kan melde av noen andre.
    const filters = adminMock.__fromCalls.filter(
      (c) => c.table === 'tournament_participants' && c.method === 'eq',
    );
    expect(filters.map((c) => c.args)).toEqual([
      ['tournament_id', 'cup-1'],
      ['user_id', ME],
    ]);

    expect(notifyMock.mock.calls[0][0].payload).toMatchObject({
      action: 'left',
      participant_name: 'Kaia',
    });
  });

  it('ikke påmeldt: ærlig no-op, ingen delete', async () => {
    adminMock = buildSupabaseMock([]);
    contextMock.mockResolvedValue(context({ facts: { alreadyJoined: false } }));

    const { leaveCup } = await import('./actions');
    const err = await leaveCup(form()).catch((e) => e);

    expect((err as RedirectError).url).toBe('/cup/bli-med/abcd1234');
    expect(adminMock.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });

  it('startet cup: avmeldingsveien er stengt, ingen delete', async () => {
    adminMock = buildSupabaseMock([]);
    contextMock.mockResolvedValue(
      context({ facts: { status: 'active', alreadyJoined: true } }),
    );

    const { leaveCup } = await import('./actions');
    expect(await leaveCup(form())).toEqual({ error: 'closed' });
    expect(adminMock.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });
});
