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

// #2209: the shared double (lib/games/__mocks__) — the real helper would eat
// this file's queued Supabase answers with its two reads.
vi.mock('@/lib/games/joinTeeGenders');
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
import { revalidateTag } from 'next/cache';
import {
  addExistingPlayerToGameCore,
  inviteEmailToGameCore,
  normalizeInviteEmail,
} from './inviteToGame';

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
 * `mockOpts` går rett til mocken: en 0-rad-test som låser `.maybeSingle()`
 * sender `{ strictSingle: true }` (#1693, #2226).
 */
async function invite(
  queue: QueryResult[],
  overrides: Partial<Parameters<typeof inviteEmailToGameCore>[0]> = {},
  mockOpts: Parameters<typeof buildSupabaseMock>[2] = {},
) {
  const client = buildSupabaseMock(queue, {}, mockOpts);
  const result = await inviteEmailToGameCore({
    client: client as unknown as SupabaseClient<Database>,
    // Webbens form: RLS-klienten er både skriver og viewer.
    viewer: client as unknown as SupabaseClient<Database>,
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
    const { result } = await invite(
      [{ data: null, error: null }],
      { isAdmin: true, rawEmail: 'bruk-og-kast@mailinator.com' },
      { strictSingle: true },
    );

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('ukjent spill-id → not_found', async () => {
    const { result } = await invite([{ data: null, error: null }], {}, {
      strictSingle: true,
    });

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
      { data: null, error: null }, // invitations-oppslaget
      { data: { id: 'inv-1' }, error: null },
    ]);

    expect(client.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
  });
});

describe('adressen tilhører en registrert bruker', () => {
  // #2207: adressen slås opp med admin-klienten (users.email er ikke lesbar
  // for innloggede); kallerens klient sjekker så at kontoen er synlig. Kø-
  // plassen etter spill-raden er derfor synlighetssjekken.
  beforeEach(() => {
    adminSupabaseMock = buildSupabaseMock([{ data: { id: RECIPIENT_ID }, error: null }]);
  });

  it('slår opp adressen eksakt med admin-klienten, ikke med kallerens klient', async () => {
    const { client } = await invite([
      gameRow(),
      { data: { id: RECIPIENT_ID }, error: null },
      { data: null, error: null },
    ]);

    const lookup = adminSupabaseMock.__fromCalls.find((c) => c.method === 'filter');
    expect(lookup).toMatchObject({ table: 'users', args: ['email', 'imatch', '^ny@example\\.com$'] });
    expect(client.__fromCalls.some((c) => c.method === 'filter' || c.method === 'ilike')).toBe(false);
    expect(client.__fromCalls).toContainEqual({ table: 'users', method: 'eq', args: ['id', RECIPIENT_ID] });
  });

  it('synligheten sjekkes med viewer-klienten, ikke med skriveklienten (#2358)', async () => {
    // App-ruta skriver med tjenesteklienten, men hva arrangøren SER skal
    // avgjøres av RLS, slik det gjør på nettsiden. Ellers ble en registrert
    // ikke-venn avvist i appen, mens nettsiden sendte en e-postinvitasjon.
    const viewer = buildSupabaseMock([{ data: null, error: null }]);
    const { result, client } = await invite(
      [
        gameRow(),
        { data: null, error: null }, // ingen åpen invitasjon
        { data: { id: 'invitation-1' }, error: null },
      ],
      { viewer: viewer as unknown as SupabaseClient<Database> },
    );

    expect(viewer.__fromCalls).toContainEqual({ table: 'users', method: 'eq', args: ['id', RECIPIENT_ID] });
    expect(client.__fromCalls.some((c) => c.table === 'users')).toBe(false);
    // Ikke synlig for kalleren → e-post-grenen, som på nettsiden.
    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
  });

  it('en konto kalleren ikke ser, behandles som ukjent adresse (e-post-grenen)', async () => {
    const { result, client } = await invite([
      gameRow(),
      { data: null, error: null }, // synlighetssjekken: ikke synlig
      { data: null, error: null }, // ingen åpen invitasjon
      { data: { id: 'invitation-1' }, error: null },
    ]);

    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    expect(client.__fromCalls.find((c) => c.method === 'insert')?.table).toBe('invitations');
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

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
    adminSupabaseMock = buildSupabaseMock([
      { data: null, error: null }, // adresse-oppslaget: ingen konto
      { data: [{ id: 'invitation-1' }], error: null },
    ]);

    const { result, client } = await invite([gameRow(), openInvite]);

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
    expect(adminSupabaseMock.from.mock.invocationCallOrder.at(-1)).toBeLessThan(
      sendInviteNotificationMock.mock.invocationCallOrder[0]!,
    );
  });

  it('en ikke-admin finner bare sine egne åpne invitasjoner (#2358)', async () => {
    // RLS gir arrangøren bare radene hen selv har sendt («invitations creator
    // game-invite select», 0092). Filteret står i kjernen, så appen — som
    // leser med tjenesteklienten — ikke forlenger en kapteins eller en admins
    // invitasjon.
    adminSupabaseMock = buildSupabaseMock([{ data: null, error: null }]);

    const { client } = await invite([gameRow(), { data: null, error: null }, { data: { id: 'invitation-2' }, error: null }]);

    expect(client.__fromCalls).toContainEqual({
      table: 'invitations',
      method: 'eq',
      args: ['invited_by', INVITER_ID],
    });
  });

  it('en admin finner alle åpne invitasjoner, som under RLS', async () => {
    adminSupabaseMock = buildSupabaseMock([
      { data: null, error: null },
      { data: [{ id: 'invitation-1' }], error: null },
    ]);

    const { client } = await invite([gameRow(), openInvite], { isAdmin: true });

    expect(
      client.__fromCalls.some((c) => c.method === 'eq' && c.args[0] === 'invited_by'),
    ).toBe(false);
  });

  it('0 rader på frist-forlengelsen → invite_failed, ingen mail', async () => {
    // AGENTS trap 2: `error == null` med 0 rader er en feil, ikke en suksess.
    adminSupabaseMock = buildSupabaseMock([
      { data: null, error: null },
      { data: [], error: null },
    ]);

    const { result } = await invite([gameRow(), openInvite]);

    expect(result).toEqual({ ok: false, reason: 'invite_failed' });
    expect(sendInviteNotificationMock).not.toHaveBeenCalled();
  });

  it('en mail som kaster på re-sendingen er best-effort — raden står', async () => {
    adminSupabaseMock = buildSupabaseMock([
      { data: null, error: null },
      { data: [{ id: 'invitation-1' }], error: null },
    ]);
    sendInviteNotificationMock.mockRejectedValueOnce(new Error('Resend 500'));

    const { result, client } = await invite([gameRow(), openInvite]);

    expect(result).toEqual({ ok: true, kind: 'sent', email: 'ny@example.com' });
    expect(client.__fromCalls.some((c) => c.method === 'delete')).toBe(false);
  });
});

/**
 * #2215: picker-add som kjerne. Webbens `addExistingPlayerToGame` og appens
 * `POST /api/games/[id]/players/[userId]` kaller begge hit, så grenene bevises
 * her én gang. `inviteToGameActions.test.ts` beviser webbens query-koder, og
 * rute-testen beviser porten.
 */
describe('addExistingPlayerToGameCore', () => {
  // `vi.clearAllMocks()` tømmer ikke `mockResolvedValueOnce`-køen, og en
  // admin-test lenger opp legger et tomt sett resolveren aldri spør om. Uten
  // denne nullstillingen arver første ikke-admin-kall her det settet.
  beforeEach(() => {
    inviteEligibleIdsMock.mockReset();
    inviteEligibleIdsMock.mockImplementation(async () => new Set([RECIPIENT_ID]));
  });

  async function add(
    queue: QueryResult[],
    overrides: Partial<Parameters<typeof addExistingPlayerToGameCore>[0]> = {},
    mockOpts: Parameters<typeof buildSupabaseMock>[2] = {},
  ) {
    const client = buildSupabaseMock(queue, {}, mockOpts);
    const result = await addExistingPlayerToGameCore({
      client: client as unknown as SupabaseClient<Database>,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
      isAdmin: false,
      recipientUserId: RECIPIENT_ID,
      ...overrides,
    });
    return { result, client };
  }

  const inserts = (client: ReturnType<typeof buildSupabaseMock>) =>
    client.__fromCalls.filter((c) => c.method === 'insert');

  it('ukjent spill-id → not_found, ingen skriving', async () => {
    const { result, client } = await add([{ data: null, error: null }], {}, {
      strictSingle: true,
    });

    expect(result).toEqual({ ok: false, reason: 'not_found' });
    expect(inserts(client)).toEqual([]);
  });

  it.each(['active', 'finished'])(
    'status %s → game_locked, ingen skriving og ingen notify',
    async (status) => {
      const { result, client } = await add([gameRow({ status })]);

      expect(result).toEqual({ ok: false, reason: 'game_locked' });
      expect(inserts(client)).toEqual([]);
      expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    },
  );

  it('utenfor venne-/klubb-scopet → invite_not_allowed, FØR plassen telles', async () => {
    // ⚠️ På rute-stien er denne sjekken den ENESTE håndhevelsen (0115-triggeren
    // no-op-er under service-role). Rekkefølgen er webbens: porten før taket,
    // så en full runde og en fremmed mottaker gir invite_not_allowed.
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { result, client } = await add([
      gameRow({ game_mode: 'best_ball', group_id: 'klubb-1' }),
      { data: null, error: null, count: 40 },
    ]);

    expect(result).toEqual({ ok: false, reason: 'invite_not_allowed' });
    expect(inviteEligibleIdsMock).toHaveBeenCalledWith(INVITER_ID, 'klubb-1');
    expect(client.__fromCalls.filter((c) => c.table === 'game_players')).toEqual([]);
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('format-taket er nådd → game_full, ingen skriving', async () => {
    const { result, client } = await add([
      gameRow({ game_mode: 'best_ball' }),
      // `organizerPlayerCap('best_ball')` er 40 (#2148).
      { data: null, error: null, count: 40 },
    ]);

    expect(result).toEqual({ ok: false, reason: 'game_full' });
    expect(inserts(client)).toEqual([]);
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('ny rad → alreadyOnRoster false, invite-varsel og tømt cache', async () => {
    const { result, client } = await add([
      gameRow(),
      { data: null, error: null }, // insert i game_players
    ]);

    expect(result).toEqual({ ok: true, alreadyOnRoster: false });
    expect(inserts(client)).toHaveLength(1);
    expect(inserts(client)[0]).toMatchObject({
      table: 'game_players',
      args: [{ game_id: GAME_ID, user_id: RECIPIENT_ID, accepted_at: null }],
    });
    expect(notifyInvitedToGameMock).toHaveBeenCalledExactlyOnceWith({
      recipientUserId: RECIPIENT_ID,
      gameId: GAME_ID,
      inviterUserId: INVITER_ID,
    });
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('allerede på rosteret (23505) → alreadyOnRoster true, INGEN ny notify', async () => {
    const { result } = await add([
      gameRow(),
      { data: null, error: { code: '23505', message: 'duplicate key value' } },
    ]);

    expect(result).toEqual({ ok: true, alreadyOnRoster: true });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    // Cachen tømmes likevel: en kappløps-duplikat betyr at noen nettopp skrev.
    expect(revalidateTag).toHaveBeenCalledWith(`game-${GAME_ID}`, { expire: 0 });
  });

  it('en ekte insert-feil → db_players, ingen notify', async () => {
    const { result } = await add([
      gameRow(),
      { data: null, error: { code: '42501', message: 'permission denied' } },
    ]);

    expect(result).toEqual({ ok: false, reason: 'db_players' });
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('seg selv: raden skrives, men ingen notify og ingen venne-sjekk', async () => {
    const { result } = await add(
      [gameRow(), { data: null, error: null }],
      { recipientUserId: INVITER_ID },
    );

    expect(result).toEqual({ ok: true, alreadyOnRoster: false });
    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
    expect(notifyInvitedToGameMock).not.toHaveBeenCalled();
  });

  it('admin er unntatt venne-porten og spør aldri resolveren', async () => {
    inviteEligibleIdsMock.mockResolvedValueOnce(new Set<string>());

    const { result } = await add([gameRow(), { data: null, error: null }], {
      isAdmin: true,
    });

    expect(result).toEqual({ ok: true, alreadyOnRoster: false });
    expect(inviteEligibleIdsMock).not.toHaveBeenCalled();
  });
});
