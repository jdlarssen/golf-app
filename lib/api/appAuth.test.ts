// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Type A (#1891): den delte adgangssjekken for app→server-ruter.
 *
 * To regler bor her og testes her: «hvem er kalleren» (kun fra det validerte
 * tokenet) og «er kalleren arrangør» (admin ELLER oppretter). Rutene som
 * bruker dem tester sin egen HTTP-form, ikke reglene på nytt.
 */

/** Tokenene som faktisk ble sendt til GoTrue. Tom = ingen rundtur. */
const getUserCalls: string[] = [];
/** `[tabell, kolonne, verdi]` per oppslag, i rekkefølge. */
const selects: Array<[string, string, string]> = [];

const VALID_TOKEN = 'gyldig-token';
const TOKEN_USER_ID = 'user-fra-token';

const CREATOR = 'oppretteren';
const ADMIN = 'klubb-admin';
const STRANGER = 'en-fremmed';
const GAME = 'spill-1';

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    auth: {
      // Speiler auth-js: ugyldig token gir { data: { user: null }, error }.
      getUser: (jwt: string) => {
        getUserCalls.push(jwt);
        return Promise.resolve(
          jwt === VALID_TOKEN
            ? { data: { user: { id: TOKEN_USER_ID } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } },
        );
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => {
            selects.push([table, column, value]);
            if (table === 'games') {
              return Promise.resolve({
                data: value === GAME ? { created_by: CREATOR } : null,
              });
            }
            return Promise.resolve({
              data: { is_admin: value === ADMIN },
            });
          },
        }),
      }),
    }),
  }),
}));

const { authenticatedUserId, gameOrganiserAccess } = await import('./appAuth');

/** En request med akkurat de headerne testen bryr seg om. */
function request(authorization?: string) {
  return {
    headers: {
      get: (name: string) =>
        name === 'authorization' ? (authorization ?? null) : null,
    },
  } as unknown as Parameters<typeof authenticatedUserId>[0];
}

beforeEach(() => {
  getUserCalls.length = 0;
  selects.length = 0;
});

describe('authenticatedUserId', () => {
  it('gir id-en fra det validerte tokenet', async () => {
    expect(await authenticatedUserId(request(`Bearer ${VALID_TOKEN}`))).toBe(
      TOKEN_USER_ID,
    );
    expect(getUserCalls).toEqual([VALID_TOKEN]);
  });

  it('avviser et token GoTrue ikke godtar', async () => {
    expect(await authenticatedUserId(request('Bearer utløpt'))).toBeNull();
    expect(getUserCalls).toEqual(['utløpt']);
  });

  it.each([
    ['uten header', undefined],
    ['med feil skjema', 'Basic abc'],
    ['med tom Bearer', 'Bearer    '],
  ])('svarer null %s — og spør aldri GoTrue', async (_label, header) => {
    expect(await authenticatedUserId(request(header))).toBeNull();
    // Negativt bevis: en request uten brukbart token skal ikke koste en rundtur.
    expect(getUserCalls).toEqual([]);
  });
});

describe('gameOrganiserAccess', () => {
  it('slipper inn den som opprettet runden', async () => {
    expect(await gameOrganiserAccess(CREATOR, GAME)).toBe('organiser');
    // Oppretteren avgjøres av spill-raden alene — ingen rolle-oppslag trengs.
    expect(selects).toEqual([['games', 'id', GAME]]);
  });

  it('slipper inn en klubb-admin som ikke opprettet runden', async () => {
    expect(await gameOrganiserAccess(ADMIN, GAME)).toBe('organiser');
    expect(selects).toEqual([
      ['games', 'id', GAME],
      ['users', 'id', ADMIN],
    ]);
  });

  it('avviser en spiller som hverken er admin eller oppretter', async () => {
    expect(await gameOrganiserAccess(STRANGER, GAME)).toBe('not_organiser');
  });

  it('svarer ukjent spill — også for en admin, så 404-en ikke røper rollen', async () => {
    expect(await gameOrganiserAccess(ADMIN, 'finnes-ikke')).toBe(
      'game_not_found',
    );
    // Stopper på spill-oppslaget: rollen spørres aldri om for et spill som
    // ikke finnes.
    expect(selects).toEqual([['games', 'id', 'finnes-ikke']]);
  });
});
