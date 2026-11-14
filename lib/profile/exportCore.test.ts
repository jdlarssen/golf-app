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
 *     bare til brukerraden og `game_players` (#2207, #2445); alt annet går
 *     gjennom kallerens egen klient, så RLS gjelder i tillegg.
 *  2. En lesing som feiler, gir `{ ok: false }` med navnet på lesingen, også
 *     for hver av de sju nye tabellene. Ingen halv fil.
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

import { buildUserExport, EXPORT_KEYS, type ExportRead } from './exportCore';

let failing: ExportRead | null;
let userRow: Record<string, unknown> | null;

const NEW_READS = [
  'handicap_history',
  'notifications',
  'ai_consents',
  'kavalkades',
  'kavalkade_shares',
  'reactions',
  'idea_submissions',
] as const satisfies readonly ExportRead[];

function readOf(op: QueryOp): ExportRead {
  if (op.table === 'invitations') {
    return op.filters.some((f) => f.op === 'imatch') ? 'invitations by email' : 'invitations by inviter';
  }
  if (op.table === 'group_members') return 'club_memberships';
  return op.table as ExportRead;
}

function respond(client: 'admin' | 'caller', op: QueryOp): QueryResponse {
  if (op.kind !== 'select') throw new Error(`uventet ${op.kind} ${op.table}`);
  const read = readOf(op);
  if (failing === read) return { data: null, error: { message: `${read} failed` } };
  if (read === 'users') return { data: userRow };
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
});

describe('buildUserExport', () => {
  it('leser bare kallerens egne rader, og service-rollen bare for brukerraden og game_players', async () => {
    const result = await run();

    expect(result.ok).toBe(true);
    expect(admin.ops.map((op) => op.table).sort()).toEqual(['game_players', 'users']);
    for (const op of [...admin.ops, ...caller.ops]) {
      expect([op.table, filteredOnUser(op)]).toEqual([op.table, true]);
    }
    // De sju nye tabellene går gjennom kallerens klient, filtrert på eier-kolonnen.
    for (const table of NEW_READS) {
      const op = caller.ops.find((o) => o.table === table);
      expect(op?.filters).toContainEqual({ op: 'eq', column: 'user_id', value: USER });
    }
  });

  it('har nøklene i EXPORT_KEYS, i den rekkefølgen, og lister for de nye tabellene', async () => {
    const result = await run();
    if (!result.ok) throw new Error('forventet en fil');

    expect(Object.keys(result.payload)).toEqual(['exported_at', ...EXPORT_KEYS]);
    for (const table of NEW_READS) {
      expect(result.payload[table]).toEqual([{ id: `${table}-1`, user_id: USER, via: 'caller' }]);
    }
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
// Kavalkaden og delingene av den er ett ord.
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
