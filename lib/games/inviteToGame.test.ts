import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';

/**
 * Type A (#1919): e-post-invitasjons-kjernen.
 *
 * Fila er den ene fasiten for grenene. `inviteToGameActions.test.ts` beviser
 * fortsatt webbens oversettelse fra utfall til query-parameter, og
 * `app/api/games/[id]/invite/route.test.ts` beviser porten — ingen av dem
 * re-assertererer grenene her.
 *
 * Kjernen har INGEN egen authz: den spør aldri hvem som ringer. Det som testes
 * her er derfor reglene, ikke tilgangen — `isAdmin` og `inviterUserId` er
 * parametre kalleren har gatet på forhånd.
 */

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

const notifyInvitedToGameMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/notifyInvitedToGame', () => ({
  notifyInvitedToGame: (...args: unknown[]) => notifyInvitedToGameMock(...args),
}));

const sendInviteNotificationMock =
  vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
vi.mock('@/lib/mail/inviteNotification', () => ({
  sendInviteNotification: (...args: unknown[]) =>
    sendInviteNotificationMock(...args),
}));

// Venne-/klubb-resolveren (#906) leser med admin-klienten; her styres settet
// per test i stedet. Default: mottakeren er kvalifisert.
const inviteEligibleIdsMock = vi.fn<(...args: unknown[]) => Promise<Set<string>>>(
  async () => new Set<string>([RECIPIENT_ID]),
);
vi.mock('@/lib/games/inviteEligibility', () => ({
  getInviteEligibleIds: (...args: unknown[]) => inviteEligibleIdsMock(...args),
}));

// Frist-forlengelsen på en åpen invitasjon går gjennom admin-klienten uansett
// hvilken klient kalleren sendte inn — egen kø, så skrivingen kan skilles fra
// lesingene.
let adminSupabaseMock: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => adminSupabaseMock,
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { inviteEmailToGameCore, normalizeInviteEmail } from './inviteToGame';

const INVITER_ID = '11111111-1111-1111-1111-111111111111';
const RECIPIENT_ID = '22222222-2222-2222-2222-222222222222';
const GAME_ID = '33333333-3333-3333-3333-333333333333';

/** Spill-raden `loadGameForInvite` leser. */
function gameRow(overrides: Record<string, unknown> = {}): QueryResult {
  return {
    data: {
      id: GAME_ID,
      name: 'Tirsdagsrunden',
      status: 'scheduled',
      game_mode: 'stroke_play',
      group_id: null,
      mode_config: null,
      ...overrides,
    },
    error: null,
  };
}

/**
 * Kjør kjernen med en kø av forhåndssvar. Klienten er `buildSupabaseMock`, som
 * ikke forstår filtre — testen asserterer på `__fromCalls` der det er poenget.
 */
async function invite(
  queue: QueryResult[],
  overrides: Partial<Parameters<typeof inviteEmailToGameCore>[0]> = {},
) {
  const client = buildSupabaseMock(queue);
  const result = await inviteEmailToGameCore({
    client: client as unknown as SupabaseClient<Database>,
    gameId: GAME_ID,
    inviterUserId: INVITER_ID,
    inviterName: 'Kari',
    isAdmin: false,
    rawEmail: 'ny@example.com',
    ...overrides,
  });
  return { result, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminSupabaseMock = buildSupabaseMock([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('normalizeInviteEmail', () => {
  it('trimmer og senker, slik raden og redirect-URL-en ser den samme adressen', () => {
    expect(normalizeInviteEmail('  Ny@Example.COM ')).toBe('ny@example.com');
  });
});

describe('avvisninger før noe skrives', () => {
  it.each([
    ['tom streng', '   '],
    ['uten krøllalfa', 'ikke-en-adresse'],
  ])('%s → invalid_email, og databasen er aldri rørt', async (_label, raw) => {
    const { result, client } = await invite([], { rawEmail: raw });

    expect(result).toEqual({ ok: false, reason: 'invalid_email' });
    expect(client.__fromCalls).toEqual([]);
  });

  it('disposable-domene fra en ikke-admin arrangør → disposable_email', async () => {
    const { result, client } = await invite([], {
      rawEmail: 'bruk-og-kast@mailinator.com',
    });

    expect(result).toEqual({ ok: false, reason: 'disposable_email' });
    expect(client.__fromCalls).toEqual([]);
  });

  it('admin slipper forbi disposable-guarden (#422, kurator-modellen)', async () => {
    // Går videre til spill-lesingen, altså stoppet den ikke på domenet.
    const { result } = await invite([{ data: null, error: null }], {
      isAdmin: true,
      rawEmail: 'bruk-og-kast@mailinator.com',
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('ukjent spill-id → not_found', async () => {
    const { result } = await invite([{ data: null, error: null }]);

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('en spørrings-feil KASTER i stedet for å påstå not_found (#1445)', async () => {
    await expect(
      invite([{ data: null, error: { message: 'connection reset' } }]),
    ).rejects.toThrow('connection reset');
  });

  it.each(['active', 'finished'])('status %s → game_locked', async (status) => {
    const { result } = await invite([gameRow({ status })]);

    expect(result).toEqual({ ok: false, reason: 'game_locked' });
  });

  it('format-taket er nådd → game_full', async () => {
    const { result } = await invite([
      gameRow({ game_mode: 'best_ball' }),
      // `organizerPlayerCap('best_ball')` er 40 (#2148); 40 aktive rader fyller den.
      { data: null, error: null, count: 40 },
    ]);

    expect(result).toEqual({ ok: false, reason: 'game_full' });
  });

  it('et format uten tak spør ikke om antallet i det hele tatt', async () => {
    const { client } = await invite([
      gameRow(),
      { data: null, error: null }, // users-oppslaget
      { data: null, error: null }, // invitations-oppslaget
      { data: { id: 'inv-1' }, error: null },
    ]);

    expect(client.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
  });
});

describe('adressen tilhører en registrert bruker', () => {
  it('legges på rosteret → added, uten mail', async () => {
    const { result, client } = await invite([
      gameRow(),
      { data: { id: RECIPIENT_ID }, error: null },
      { data: null, error: null }, // insert i game_players
    ]);

    expect(result).toEqual({ ok: true, kind: 'added', email: 'ny@example.com' });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).toHaveBeenCalledWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });
    const insert = client.__fromCalls.find((c) => c.method === 'insert');
    expect(insert?.table).toBe('game_players');
    // #463: arrangøren legger til en annen → ikke bekreftet ennå.
    expect(insert?.args[0]).toMatchObject({
      game_id: GAME_ID,
      user_id: RECIPIENT_ID,
      accepted_at: null,
    });
  });

  it('allerede på rosteret (23505) → added, men INGEN ny notify', async () => {
    const { result } = await invite([
      gameRow(),
      { data: { id: RECIPIENT_ID }, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key value' } },
    ]);

    expect(result).toEqual({ ok: true, kind: 'added', email: 'ny@example.com' });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('en ekte insert-feil → db_players', async () => {
    const { result } = await invite([
      gameRow(),
      { data: { id: RECIPIENT_ID }, error: null },
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ]);

    expect(result).toEqual({ ok: false, reason: 'db_players' });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('utenfor venne-/klubb-scopet → invite_not_allowed, ingen skriving', async () => {
    // ⚠️ På rute-stien er denne sjekken den ENESTE håndhevelsen: under
    // service-role no-op-er 0115-triggeren.
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { result, client } = await invite([
      gameRow(),
      { data: { id: RECIPIENT_ID }, error: null },
    ]);

    expect(result).toEqual({ ok: false, reason: 'invite_not_allowed' });
    expect(client.__fromCalls.some((c) => c.method === 'insert')).toBe(false);
  });

  it('admin er unntatt scopingen og spør aldri resolveren', async () => {
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { result } = await invite(
      [
        gameRow(),
        { data: { id: RECIPIENT_ID }, error: null },
        { data: null, error: null },
      ],
      { isAdmin: true },
    );

    expect(result).toEqual({ ok: true, kind: 'added', email: 'ny@example.com' });
    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
  });
});

describe('ukjent adresse', () => {
  it('ny invitasjon → rad + mail, og utfallet er sent', async () => {
    const { result, client } = await invite([
      gameRow(),
      { data: null, error: null }, // ingen bruker
      { data: null, error: null }, // ingen åpen invitasjon
      { data: { id: 'invitation-1' }, error: null },
    ]);

    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    const insert = client.__fromCalls.find(
      (c) => c.method === 'insert' && c.table === 'invitations',
    );
    expect(insert?.args[0]).toMatchObject({
      email: 'ny@example.com',
      invited_by: INVITER_ID,
      game_id: GAME_ID,
    });
    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ny@example.com', invitedByName: 'Kari' }),
    );
  });

  it('uten navn faller avsenderen til rollen', async () => {
    await invite(
      [
        gameRow(),
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: 'invitation-1' }, error: null },
      ],
      { inviterName: '  ' },
    );

    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ invitedByName: 'En arrangør' }),
    );
  });

  it('insert-feil → invite_failed, og ingen mail går ut', async () => {
    const { result } = await invite([
      gameRow(),
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: { message: 'insert failed' } },
    ]);

    expect(result).toEqual({ ok: false, reason: 'invite_failed' });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('mail som kaster ruller raden tilbake på primærnøkkel → mail_failed', async () => {
    // #686/#705: uten rollback ville den foreldreløse raden kortsluttet hver
    // retry, og adressen aldri fått mailen.
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('Resend 500'));

    const { result, client } = await invite([
      gameRow(),
      { data: null, error: null },
      { data: null, error: null },
      { data: { id: 'invitation-1' }, error: null },
      { data: null, error: null }, // slettingen
    ]);

    expect(result).toEqual({ ok: false, reason: 'mail_failed' });
    const del = client.__fromCalls.find((c) => c.method === 'delete');
    expect(del?.table).toBe('invitations');
    // Siste `eq('id', …)`, ikke den første: den første er spill-oppslaget.
    const idFilters = client.__fromCalls.filter(
      (c) => c.method === 'eq' && c.args[0] === 'id',
    );
    expect(idFilters.at(-1)?.args[1]).toBe('invitation-1');
  });
});

describe('åpen invitasjon for samme adresse og runde', () => {
  const openInvite = {
    data: { id: 'invitation-1', token: 'token-1', expires_at: '2020-01-01T00:00:00.000Z' },
    error: null,
  } satisfies QueryResult;

  it('forlenger fristen FØR mailen, og lager ingen ny rad', async () => {
    // #1381/#1613: en utløpt-men-uakseptert invitasjon skal aldri produsere en
    // mail innloggings-gaten nekter.
    adminSupabaseMock = buildSupabaseMock([{ data: [{ id: 'invitation-1' }], error: null }]);

    const { result, client } = await invite([
      gameRow(),
      { data: null, error: null },
      openInvite,
    ]);

    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    // Ingen ny rad: bruker-klienten skrev ingenting.
    expect(client.__fromCalls.some((c) => c.method === 'insert')).toBe(false);
    const update = adminSupabaseMock.__fromCalls.find((c) => c.method === 'update');
    const freshExpiry = (update?.args[0] as { expires_at: string }).expires_at;
    expect(new Date(freshExpiry).getTime()).toBeGreaterThan(Date.now());
    // Rekkefølgen er poenget: mailen bærer den NYE fristen.
    expect(sendInviteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ inviteToken: 'token-1', expiresAt: freshExpiry }),
    );
    expect(adminSupabaseMock.from.mock.invocationCallOrder[0]).toBeLessThan(
      sendInviteNotificationMock.mock.invocationCallOrder[0]!,
    );
  });

  it('0 rader på frist-forlengelsen → invite_failed, ingen mail', async () => {
    // AGENTS trap 2: `error == null` med 0 rader er en feil, ikke en suksess.
    adminSupabaseMock = buildSupabaseMock([{ data: [], error: null }]);

    const { result } = await invite([
      gameRow(),
      { data: null, error: null },
      openInvite,
    ]);

    expect(result).toEqual({ ok: false, reason: 'invite_failed' });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('en mail som kaster på re-sendingen er best-effort — raden står', async () => {
    adminSupabaseMock = buildSupabaseMock([{ data: [{ id: 'invitation-1' }], error: null }]);
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('Resend 500'));

    const { result, client } = await invite([
      gameRow(),
      { data: null, error: null },
      openInvite,
    ]);

    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    expect(client.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });
});
