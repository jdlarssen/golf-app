// Native (#1832): låser wolf-/BBB-valglaget.
//
// To ting kan drive fra hverandre uten at noe kompilerer rødt, og begge er
// låst her:
//
//  1. **Mappingen** mot webbens select-lister. Bruker de to sidene ulike
//     kolonner, får de delte context-byggerne ulik input og appen viser andre
//     tall enn nettsiden for samme runde.
//  2. **Valideringsreglene**, som bor ett sted til (webbens server actions) og
//     ikke kan importeres derfra. Særlig BBB-ens finished-lås: RLS håndhever
//     den IKKE, så uten sjekken i koden — og denne testen rundt den — kunne
//     appen skrive prestasjoner inn i et avsluttet spill.
//
// Resten er trap 2: en upsert som traff 0 rader svarer `error == null`, og skal
// aldri leses som suksess.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';

type Mocks = typeof import('../test/supabaseMock');
type Choices = typeof import('./choices');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function choices(): Choices {
  return require('./choices') as Choices;
}

const ONE_ROW = { data: [{ hole_number: 7 }], error: null };
const ZERO_ROWS = { data: [], error: null };
/** Svaret på det ferske status-oppslaget BBB-skrivingen gjør før upserten. */
const ACTIVE_GAME = { data: { status: 'active' }, error: null };

type WolfOver = Partial<Parameters<Choices['setWolfChoice']>[0]>;
type BbbOver = Partial<Parameters<Choices['setBingoBangoBongoHole']>[0]>;

/** Et gyldig wolf-valg. Testene overstyrer feltet de handler om. */
function wolfWrite(over: WolfOver = {}) {
  return {
    gameId: GAME,
    holeNumber: 7,
    wolfUserId: ME,
    choice: 'partner' as const,
    partnerUserId: MATE,
    ...over,
  };
}

function bbbWrite(over: BbbOver = {}) {
  return {
    gameId: GAME,
    holeNumber: 7,
    bingoUserId: ME,
    bangoUserId: null,
    bongoUserId: MATE,
    ...over,
  };
}

describe('choices', () => {
  useFreshModules();

  beforeEach(() => {
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  describe('fetchWolfChoices', () => {
    it('mapper rader til camelCase, i rekkefølgen serveren ga dem', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const query = queryStub({
        data: [
          {
            hole_number: 1,
            wolf_user_id: ME,
            choice: 'partner',
            partner_user_id: MATE,
          },
          {
            hole_number: 2,
            wolf_user_id: MATE,
            choice: 'lone',
            partner_user_id: null,
          },
        ],
        error: null,
      });
      routeFrom({ wolf_hole_choices: [query] });

      expect(await choices().fetchWolfChoices(GAME)).toEqual([
        { holeNumber: 1, wolfUserId: ME, choice: 'partner', partnerUserId: MATE },
        { holeNumber: 2, wolfUserId: MATE, choice: 'lone', partnerUserId: null },
      ]);
      // Kolonnelista ER kontrakten mot webben (`lib/wolf/getWolfChoices.ts`).
      expect(stepArgs(query, 'select')).toEqual([
        ['hole_number, wolf_user_id, choice, partner_user_id'],
      ]);
      expect(stepArgs(query, 'eq')).toEqual([['game_id', GAME]]);
      expect(stepArgs(query, 'order')).toEqual([
        ['hole_number', { ascending: true }],
      ]);
    });

    const EMPTY: [string, unknown][] = [
      ['tom tabell', []],
      ['null fra PostgREST', null],
    ];

    it.each(EMPTY)('gir tom liste ved %s — ikke en feil', async (_label, data) => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ wolf_hole_choices: [queryStub({ data, error: null })] });

      expect(await choices().fetchWolfChoices(GAME)).toEqual([]);
    });

    it('kaster når spørringen feiler — «vet ikke» er ikke «ingen valg»', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        wolf_hole_choices: [queryStub({ data: null, error: { message: 'offline' } })],
      });

      await expect(choices().fetchWolfChoices(GAME)).rejects.toThrow('offline');
    });
  });

  describe('fetchBingoBangoBongoHoles', () => {
    it('mapper rader til camelCase og beholder de tomme plassene', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const query = queryStub({
        data: [
          {
            hole_number: 3,
            bingo_user_id: ME,
            // Ingen nådde greena i regulering: bango står tom, og skal bli
            // null hele veien inn i motoren.
            bango_user_id: null,
            bongo_user_id: MATE,
          },
        ],
        error: null,
      });
      routeFrom({ bingo_bango_bongo_holes: [query] });

      expect(await choices().fetchBingoBangoBongoHoles(GAME)).toEqual([
        { holeNumber: 3, bingoUserId: ME, bangoUserId: null, bongoUserId: MATE },
      ]);
      expect(stepArgs(query, 'select')).toEqual([
        ['hole_number, bingo_user_id, bango_user_id, bongo_user_id'],
      ]);
      expect(stepArgs(query, 'order')).toEqual([
        ['hole_number', { ascending: true }],
      ]);
    });

    it('gir tom liste når ingen hull er registrert', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ bingo_bango_bongo_holes: [queryStub({ data: [], error: null })] });

      expect(await choices().fetchBingoBangoBongoHoles(GAME)).toEqual([]);
    });

    it('kaster når spørringen feiler', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        bingo_bango_bongo_holes: [
          queryStub({ data: null, error: { message: 'timeout' } }),
        ],
      });

      await expect(choices().fetchBingoBangoBongoHoles(GAME)).rejects.toThrow(
        'timeout',
      );
    });
  });

  describe('validateWolfChoice', () => {
    const VALID: [string, WolfOver][] = [
      ['partner på hull 1', { holeNumber: 1 }],
      ['partner på hull 18', { holeNumber: 18 }],
      ['lone uten partner', { choice: 'lone', partnerUserId: null }],
      ['blind uten partner', { choice: 'blind', partnerUserId: null }],
    ];

    const INVALID: [string, WolfOver, string][] = [
      ['hull 0', { holeNumber: 0 }, 'invalid_hole'],
      ['hull 19', { holeNumber: 19 }, 'invalid_hole'],
      ['et halvt hull', { holeNumber: 7.5 }, 'invalid_hole'],
      // Bare en manipulert/utdatert klient kan sende dette — typen tillater det
      // ikke, men vakten skal stå der uansett.
      ['ukjent valg', { choice: 'solo' as never }, 'invalid_choice'],
      [
        'partner uten partner',
        { choice: 'partner', partnerUserId: null },
        'partner_required',
      ],
      ['lone med partner', { choice: 'lone', partnerUserId: MATE }, 'partner_must_be_null'],
      [
        'blind med partner',
        { choice: 'blind', partnerUserId: MATE },
        'partner_must_be_null',
      ],
      ['wolfen som sin egen partner', { partnerUserId: ME }, 'partner_cannot_be_wolf'],
    ];

    it.each(VALID)('godtar %s', (_label, over) => {
      expect(choices().validateWolfChoice(wolfWrite(over))).toBeNull();
    });

    it.each(INVALID)('avviser %s', (_label, over, error) => {
      expect(choices().validateWolfChoice(wolfWrite(over))).toBe(error);
    });
  });

  describe('validateBingoBangoBongoHole', () => {
    it.each([['active'], ['draft'], ['scheduled']])(
      'godtar skriving i et %s spill',
      (status: string) => {
        expect(choices().validateBingoBangoBongoHole(bbbWrite(), status)).toBeNull();
      },
    );

    it('låser et ferdig spill — RLS gjør det ikke', () => {
      expect(choices().validateBingoBangoBongoHole(bbbWrite(), 'finished')).toBe(
        'game_finished',
      );
    });

    const BAD_HOLES: [string, number][] = [
      ['hull 0', 0],
      ['hull 19', 19],
      ['et halvt hull', 7.5],
    ];

    it.each(BAD_HOLES)('avviser %s', (_label, holeNumber) => {
      expect(
        choices().validateBingoBangoBongoHole(bbbWrite({ holeNumber }), 'active'),
      ).toBe('invalid_hole');
    });
  });

  describe('setWolfChoice', () => {
    it('upserter valget på (game_id, hole_number) med seg selv som taster', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const write = queryStub(ONE_ROW);
      routeFrom({ wolf_hole_choices: [write] });

      expect(await choices().setWolfChoice(wolfWrite())).toEqual({ ok: true });

      expect(stepArgs(write, 'upsert')[0]).toEqual([
        {
          game_id: GAME,
          hole_number: 7,
          wolf_user_id: ME,
          choice: 'partner',
          partner_user_id: MATE,
          entered_by: ME,
        },
        { onConflict: 'game_id,hole_number' },
      ]);
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      expect(stepArgs(write, 'select')).toEqual([['hole_number']]);
    });

    it('svarer på et ugyldig valg uten å røre databasen', async () => {
      const { supabase } = mocks();

      expect(
        await choices().setWolfChoice(wolfWrite({ partnerUserId: ME })),
      ).toEqual({ ok: false, error: 'partner_cannot_be_wolf' });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('gjør ingenting uten sesjon', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await choices().setWolfChoice(wolfWrite())).toEqual({
        ok: false,
        error: 'not_authenticated',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('leser 0 rader som feil, ikke som stille suksess', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ wolf_hole_choices: [queryStub(ZERO_ROWS)] });

      expect(await choices().setWolfChoice(wolfWrite())).toEqual({
        ok: false,
        error: 'no_rows',
      });
    });

    // Ikke alle avslag er «du har ikke lov»: 42501 er RLS, resten er «prøv
    // igjen». Samme skille som #1445 ga BBB-actionen på webben.
    const DB_ERRORS: [string, string | undefined, string][] = [
      ['RLS nekter raden (42501) → rls_denied', '42501', 'rls_denied'],
      ['en constraint ryker (23514) → db_error', '23514', 'db_error'],
      ['koden mangler helt → db_error', undefined, 'db_error'],
    ];

    it.each(DB_ERRORS)('%s', async (_label, code, error) => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        wolf_hole_choices: [
          queryStub({ data: null, error: { message: 'nei', code } }),
        ],
      });

      expect(await choices().setWolfChoice(wolfWrite())).toEqual({
        ok: false,
        error,
      });
    });
  });

  describe('setBingoBangoBongoHole', () => {
    it('upserter alle tre plassene, tomme inkludert', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const write = queryStub(ONE_ROW);
      const lookup = queryStub(ACTIVE_GAME);
      routeFrom({ games: [lookup], bingo_bango_bongo_holes: [write] });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: true,
      });

      // Statusen leses ferskt, på spillets egen rad — ikke fra bundelen.
      expect(stepArgs(lookup, 'select')).toEqual([['status']]);
      expect(stepArgs(lookup, 'eq')).toEqual([['id', GAME]]);

      // `null` skrives eksplisitt: en retting skal FJERNE forrige mottaker.
      expect(stepArgs(write, 'upsert')[0]).toEqual([
        {
          game_id: GAME,
          hole_number: 7,
          bingo_user_id: ME,
          bango_user_id: null,
          bongo_user_id: MATE,
          entered_by: ME,
        },
        { onConflict: 'game_id,hole_number' },
      ]);
      expect(stepArgs(write, 'select')).toEqual([['hole_number']]);
    });

    it('nekter å skrive når bundelen alt sier ferdig, og spør ikke databasen', async () => {
      const { supabase } = mocks();

      expect(
        await choices().setBingoBangoBongoHole(bbbWrite(), 'finished'),
      ).toEqual({ ok: false, error: 'game_finished' });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('stopper skrivingen når spillet ble avsluttet mens spilleren sto på hullet', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      // Bundelen er minutter gammel og sier fortsatt «active». Serveren vet
      // bedre — og uten det ferske oppslaget hadde raden landet: RLS spør bare
      // om du er med i spillet, ikke om spillet lever.
      // Ingen `bingo_bango_bongo_holes`-plan: prøver koden å skrive likevel,
      // kaster ruteren og testen faller.
      routeFrom({ games: [queryStub({ data: { status: 'finished' }, error: null })] });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'game_finished',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it('skiller et borte spill fra en falt spørring — 0 rader er game_not_found', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ games: [queryStub({ data: null, error: null })] });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'game_not_found',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it('gir db_error når selve oppslaget feiler (#1445: feil ≠ fravær)', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({
        games: [queryStub({ data: null, error: { message: 'nettet falt' } })],
      });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'db_error',
      });
      expect(supabase.from).toHaveBeenCalledTimes(1);
    });

    it('gjør ingenting uten sesjon', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'not_authenticated',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('leser 0 rader som feil, ikke som stille suksess', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        bingo_bango_bongo_holes: [queryStub(ZERO_ROWS)],
      });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'no_rows',
      });
    });

    it('oversetter RLS-avslag til en typet kode, aldri rå Postgres-tekst', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(ACTIVE_GAME)],
        bingo_bango_bongo_holes: [
          queryStub({
            data: null,
            error: {
              message: 'new row violates row-level security policy',
              code: '42501',
            },
          }),
        ],
      });

      expect(await choices().setBingoBangoBongoHole(bbbWrite(), 'active')).toEqual({
        ok: false,
        error: 'rls_denied',
      });
    });
  });
});
