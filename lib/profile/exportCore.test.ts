// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAdminClientMock,
  type QueryOp,
  type QueryResponse,
} from '@/lib/supabase/testing/adminClientMock';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';
import messages from '@/messages/no.json';

/**
 * Type A (#2332): kjernen bak «Last ned dataene dine», på nettsiden og i appen.
 *
 * Det som bevises:
 *  1. Hver lesing er filtrert på id-en kjernen fikk. Service-rollen brukes
 *     bare til lesingene i `SERVICE_ROLE_READS` (rader RLS skjuler for eieren
 *     selv: #2207, #2445); alt annet går gjennom kallerens egen klient, så RLS
 *     gjelder i tillegg. Vennskap er med vilje ikke blant dem (0252).
 *  2. En lesing som feiler, gir `{ ok: false }` med navnet på lesingen, også
 *     for hver av de nye tabellene. Ingen halv fil.
 *  3. Teksten under raden lister nøyaktig det fila har. Den sier hva du får,
 *     og står det noe der fila ikke har, er det et løfte vi ikke holder.
 *
 * To dobler: én for service-rollen og én for kallerens klient, så testen ser
 * hvilken klient hver lesing gikk gjennom.
 */

const USER = 'meg-selv';
const EMAIL = 'meg@example.test';

const admin = createAdminClientMock({ respond: (op) => respond('admin', op) });
const caller = createAdminClientMock({ respond: (op) => respond('caller', op) });

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin.client }));

import { buildUserExport, EXPORT_KEYS, SERVICE_ROLE_READS, type ExportRead } from './exportCore';

let failing: ExportRead | null;
let userRow: Record<string, unknown> | null;
/** What the client answers for `friendships`; null gives the default row. */
let friendshipRows: Record<string, unknown>[] | null;

const NEW_READS = [
  'handicap_history',
  'notifications',
  // #2315: the push choices.
  'notification_preferences',
  'ai_consents',
  'kavalkades',
  'kavalkade_shares',
  'reactions',
  'idea_submissions',
  // Audit 20.11: sign-ups, league and cup participation, club requests, the
  // notification devices and the newsletter log.
  'game_registration_requests',
  'league_players',
  'tournament_participants',
  'cup_lineup_slots',
  'club_join_requests',
  'push_subscriptions',
  'apns_tokens',
  'fcm_tokens',
  'product_update_digest_recipients',
] as const satisfies readonly ExportRead[];

/** The table a read goes to, where the key in the file has another name. */
const TABLE_OF: Partial<Record<ExportRead, string>> = {
  club_memberships: 'group_members',
  club_join_requests: 'group_join_requests',
};
const tableOf = (read: ExportRead): string => TABLE_OF[read] ?? read;
const viaOf = (read: ExportRead): 'admin' | 'caller' =>
  (SERVICE_ROLE_READS as readonly ExportRead[]).includes(read) ? 'admin' : 'caller';

function readOf(op: QueryOp): ExportRead {
  if (op.table === 'invitations') {
    return op.filters.some((f) => f.op === 'imatch') ? 'invitations by email' : 'invitations by inviter';
  }
  if (op.table === 'group_members') return 'club_memberships';
  if (op.table === 'group_join_requests') return 'club_join_requests';
  return op.table as ExportRead;
}

function respond(client: 'admin' | 'caller', op: QueryOp): QueryResponse {
  if (op.kind !== 'select') throw new Error(`uventet ${op.kind} ${op.table}`);
  const read = readOf(op);
  if (failing === read) return { data: null, error: { message: `${read} failed` } };
  if (read === 'users') return { data: userRow };
  if (read === 'friendships' && friendshipRows) return { data: friendshipRows };
  return { data: [{ id: `${read}-1`, user_id: USER, via: client }] };
}

/** Lesingen nevner brukeren i et filter: likhet, en `or` med id-en, eller e-posten. */
function filteredOnUser(op: QueryOp): boolean {
  return op.filters.some(
    (f) =>
      (f.op === 'eq' && f.value === USER) ||
      (f.op === 'or' && String(f.value).split(',').every((part) => part.endsWith(`.eq.${USER}`))) ||
      (f.op === 'imatch' && f.column === 'email' && f.value === emailMatchPattern(EMAIL)),
  );
}

async function run() {
  return buildUserExport(USER, caller.client as never);
}

beforeEach(() => {
  admin.reset();
  caller.reset();
  failing = null;
  userRow = { id: USER, email: EMAIL, name: 'Meg Selv' };
  friendshipRows = null;
});

describe('buildUserExport', () => {
  it('leser bare kallerens egne rader, og service-rollen bare for lesingene i SERVICE_ROLE_READS', async () => {
    const result = await run();

    expect(result.ok).toBe(true);
    expect(admin.ops.map(readOf).sort()).toEqual([...SERVICE_ROLE_READS].sort());
    expect(caller.ops.map(readOf).filter((read) => viaOf(read) === 'admin')).toEqual([]);
    for (const op of [...admin.ops, ...caller.ops]) {
      expect([op.table, filteredOnUser(op)]).toEqual([op.table, true]);
    }
    // De nye tabellene er filtrert på eier-kolonnen, hver gjennom sin klient.
    for (const read of NEW_READS) {
      const ops = viaOf(read) === 'admin' ? admin.ops : caller.ops;
      const op = ops.find((o) => o.table === tableOf(read));
      expect([read, op?.filters]).toEqual([read, [{ op: 'eq', column: 'user_id', value: USER }]]);
    }
  });

  it('har nøklene i EXPORT_KEYS, i den rekkefølgen, og lister for de nye tabellene', async () => {
    const result = await run();
    if (!result.ok) throw new Error('forventet en fil');

    expect(Object.keys(result.payload)).toEqual(['exported_at', ...EXPORT_KEYS]);
    for (const read of NEW_READS) {
      expect(result.payload[read]).toEqual([{ id: `${read}-1`, user_id: USER, via: viaOf(read) }]);
    }
  });

  // 0252: raden for en ubesvart venneforespørsel sendt på e-post sier at
  // adressen har en konto (`addressee_id`). Avsenderens egen økt leser den
  // ikke, og fila skal ikke gjøre det heller.
  it('vennskap leses med kallerens klient, så RLS skjuler en ubesvart forespørsel sendt på e-post', async () => {
    await run();

    expect(admin.ops.some((o) => o.table === 'friendships')).toBe(false);
    const friendships = caller.ops.find((o) => o.table === 'friendships');
    expect(friendships?.filters).toEqual([
      { op: 'or', column: '', value: `requester_id.eq.${USER},addressee_id.eq.${USER}` },
    ]);
  });

  it('en ubesvart forespørsel sendt på e-post er ikke i fila, selv om klienten skulle svare med raden', async () => {
    friendshipRows = [
      { id: 'f-sendt', requester_id: USER, addressee_id: 'har-konto', status: 'pending', by_email: true },
      { id: 'f-godtatt', requester_id: USER, addressee_id: 'venn-1', status: 'accepted', by_email: true },
      { id: 'f-vanlig', requester_id: USER, addressee_id: 'venn-2', status: 'pending', by_email: false },
      { id: 'f-mottatt', requester_id: 'venn-3', addressee_id: USER, status: 'pending', by_email: true },
    ];

    const result = await run();
    if (!result.ok) throw new Error('forventet en fil');

    expect((result.payload.friendships as { id: string }[]).map((row) => row.id)).toEqual([
      'f-godtatt',
      'f-vanlig',
      'f-mottatt',
    ]);
    expect(JSON.stringify(result.payload)).not.toContain('har-konto');
  });

  // En invitasjon sendt til en runde andre arrangerer er skjult for avsenderens
  // egen økt, så den leses med service-rollen, filtrert på avsenderen.
  it('sendte invitasjoner leses med service-rollen, filtrert på avsenderen', async () => {
    await run();

    const sent = admin.ops.find((o) => o.table === 'invitations');
    expect(sent?.filters).toEqual([{ op: 'eq', column: 'invited_by', value: USER }]);
  });

  it('nettleserens varselrad eksporteres uten krypteringsnøklene', async () => {
    await run();

    const op = caller.ops.find((o) => o.table === 'push_subscriptions');
    expect(op?.columns).not.toMatch(/p256dh|auth\b|\*/);
    expect(op?.columns).toContain('endpoint');
  });

  it('varselvalgene leses med alle kolonnene, så «Del sjeldne slag med alle» (#2894) er med', async () => {
    await run();

    const op = caller.ops.find((o) => o.table === 'notification_preferences');
    expect(op?.columns).toBe('*');
  });

  it.each(NEW_READS)('en lesefeil i %s gir { ok: false } og ingen fil', async (read) => {
    failing = read;

    // Sidevise lesinger pakker feilen inn i en `Error`; navnet på lesingen er det som teller.
    expect(await run()).toMatchObject({ ok: false, read });
  });

  it('en manglende brukerrad gir { ok: false } før noen invitasjon leses', async () => {
    userRow = null;

    const result = await run();

    expect(result).toMatchObject({ ok: false, read: 'users' });
    expect(caller.ops.some((op) => op.table === 'invitations')).toBe(false);
  });
});

// «Profilen, handicaphistorikken, … og ideene dine i én fil.» Hver nøkkel i
// fila har ett ord i setningen, og setningen har ikke et ord fila mangler.
// Kavalkaden og delingene av den er ett ord, og varslene og valgene for dem
// også (#2315).
describe('teksten under «Last ned dataene dine»', () => {
  const WORD: Record<(typeof EXPORT_KEYS)[number], string> = {
    user: 'Profilen',
    handicap_history: 'handicaphistorikken',
    game_players: 'spillene',
    scores: 'slagene',
    reactions: 'reaksjonene',
    invitations: 'invitasjonene',
    friendships: 'vennene',
    club_memberships: 'klubbene',
    notifications: 'varslene',
    notification_preferences: 'varslene',
    // The devices and the newsletter log are part of «varslene» too.
    push_subscriptions: 'varslene',
    apns_tokens: 'varslene',
    fcm_tokens: 'varslene',
    product_update_digest_recipients: 'varslene',
    game_registration_requests: 'påmeldingene',
    league_players: 'ligaene',
    tournament_participants: 'cupene',
    cup_lineup_slots: 'cupene',
    // Requests to join a club stand with the clubs.
    club_join_requests: 'klubbene',
    ai_consents: 'AI-svaret',
    kavalkades: 'Kavalkaden',
    kavalkade_shares: 'Kavalkaden',
    idea_submissions: 'ideene',
  };

  it('lister nøyaktig det fila har', () => {
    const sublabel = messages.profile.data.exportSublabel;
    const listed = sublabel
      .replace(/ dine i én fil\.$/, '')
      .split(/, | og /);

    expect(new Set(listed)).toEqual(new Set(Object.values(WORD)));
    expect(listed).toHaveLength(new Set(listed).size);
  });
});
