// Native N6c (#1856): avslutt-flyten fra appen.
//
// Suiten har to tyngdepunkt.
//
// 1. **Paritet med `lib/games/endGameCore.ts:153-196`.** `endGameCore` er
//    `server-only` og kan ikke importeres her, så gatene er speilet. Det finnes
//    ingen kompilator som holder de to i lås — én test per gren gjør det i
//    stedet. Peer-gaten har sin egen test for at `allowMissing` IKKE slakker
//    den; det er regelen det er lettest å miste i en refaktorering.
// 2. **Skriverekkefølgen.** Frafall → kåring → status-flipp. Snus de to siste,
//    kan et spill bli `finished` uten kåring, og #1850-seksjonen viser en tom
//    sideturnering som ser ferdig ut. `supabase.from`-kallrekkefølgen er den
//    eneste kvitteringen på at rekkefølgen holder.
//
// Reglene selv — hvilke formater som støtter frafall, hva et frafall gjør med
// tavla — er testet i `lib/` og i `rosterActions.test.ts`. De asserteres ikke om
// igjen her.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

// Nett-status styres per test. `mock`-prefikset er jests egen regel for
// variabler en `jest.mock`-fabrikk får lov å lukke over.
const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

const GAME = 'game-1';
const ME = 'user-me';
const MATE = 'user-mate';
const OTHER = 'user-other';
const SUBMITTED = '2026-09-01T10:00:00.000Z';

type Mocks = typeof import('../test/supabaseMock');
type EndGame = typeof import('./endGame');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function endGame(): EndGame {
  return require('./endGame') as EndGame;
}

/** Spillets gate-rad, slik `loadFinishGate` leser den. */
function gameRow(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      status: 'active',
      game_mode: 'stableford',
      require_peer_approval: false,
      tournament_id: null,
      ...overrides,
    },
    error: null,
  };
}

/** Gate-raden `withdrawPlayer` (rosterActions) leser før sitt eget skriv. */
const WD_GATE = {
  data: { status: 'active', game_mode: 'stableford', mode_config: null },
  error: null,
};

/** Én roster-rad. Default: levert, ikke godkjent, ikke trukket. */
function playerRow(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    submitted_at: SUBMITTED,
    approved_at: null,
    withdrawn_at: null,
    ...overrides,
  };
}

function roster(...rows: Record<string, unknown>[]) {
  return { data: rows, error: null };
}

const ONE_ROW = { data: [{ id: GAME }], error: null };
const ZERO_ROWS = { data: [], error: null };

/** Filtrene som ble kjedet på, som «metode(arg, arg)»-strenger. */
function filtersOf(stub: ReturnType<Mocks['queryStub']>): string[] {
  return stub.steps
    .filter(
      (s) =>
        s.method !== 'update' &&
        s.method !== 'upsert' &&
        s.method !== 'insert' &&
        s.method !== 'select' &&
        s.method !== 'returns' &&
        s.method !== 'maybeSingle',
    )
    // `String(null)` og ikke `join` direkte: join gjør null til tom streng, og
    // da ville et manglende null-filter sett identisk ut med et som står der.
    .map((s) => `${s.method}(${s.args.map((a) => String(a)).join(',')})`);
}

/** Tabellene `supabase.from(...)` ble kalt med, i rekkefølge. */
function tablesTouched(): string[] {
  return mocks().supabase.from.mock.calls.map((call) => call[0] as string);
}

describe('finishRound', () => {
  useFreshModules();

  beforeEach(() => {
    mockNetwork.online = true;
    mocks().currentDeviceUserId.mockResolvedValue(ME);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Forutsetninger
  // ───────────────────────────────────────────────────────────────────────────

  describe('forutsetninger', () => {
    it('nekter uten sesjon, og rører ikke DB', async () => {
      const { supabase, currentDeviceUserId } = mocks();
      currentDeviceUserId.mockResolvedValue(null);

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'no-session',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('nekter uten nett — avslutningen går aldri i sync-køen', async () => {
      mockNetwork.online = false;
      const { supabase } = mocks();

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'offline',
      });
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('svarer not-found når spillet ikke er synlig', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub({ data: null, error: null })] });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'not-found',
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Gatene, speilet fra endGameCore:153-196
  // ───────────────────────────────────────────────────────────────────────────

  describe('gater', () => {
    it('avviser en cup-kamp uten å skrive noe — den avsluttes fra nettsiden', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub(gameRow({ tournament_id: 'cup-7' }))] });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'cup-game',
      });
      // Ett oppslag, null skriv: porten står før alt annet.
      expect(tablesTouched()).toEqual(['games']);
    });

    it('avviser et spill som ikke er aktivt (endGameCore:153-155)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ games: [queryStub(gameRow({ status: 'scheduled' }))] });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'not-active',
      });
      expect(tablesTouched()).toEqual(['games']);
    });

    it('avviser et spill uten spillere (endGameCore:178-180)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow())],
        game_players: [queryStub(roster())],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'no-players',
      });
    });

    it('blokkerer på manglende leveringer, og navngir hvem (endGameCore:181-193)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow())],
        game_players: [
          queryStub(
            roster(
              playerRow(ME),
              playerRow(MATE, { submitted_at: null }),
              playerRow(OTHER, { submitted_at: null }),
            ),
          ),
        ],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'not-all-submitted',
        blockedUserIds: [MATE, OTHER],
      });
    });

    it('slipper manglende leveringer forbi med allowMissing («avslutt likevel»)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow()), queryStub(ONE_ROW)],
        game_players: [
          queryStub(roster(playerRow(ME), playerRow(MATE, { submitted_at: null }))),
        ],
      });

      expect(
        await endGame().finishRound(GAME, { allowMissing: true }),
      ).toEqual({ ok: true, alreadyFinished: false });
    });

    it('lar trukne spillere stå — de blokkerer hverken levering eller godkjenning', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [
          queryStub(gameRow({ require_peer_approval: true })),
          queryStub(ONE_ROW),
        ],
        game_players: [
          queryStub(
            roster(
              playerRow(ME, { approved_at: SUBMITTED }),
              playerRow(MATE, {
                submitted_at: null,
                approved_at: null,
                withdrawn_at: SUBMITTED,
              }),
            ),
          ),
        ],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: true,
        alreadyFinished: false,
      });
    });

    it('blokkerer på manglende godkjenning, og navngir hvem (endGameCore:194-196)', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow({ require_peer_approval: true }))],
        game_players: [
          queryStub(
            roster(playerRow(ME, { approved_at: SUBMITTED }), playerRow(MATE)),
          ),
        ],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'not-all-approved',
        blockedUserIds: [MATE],
      });
    });

    it('lar ALDRI allowMissing slakke peer-gaten', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow({ require_peer_approval: true }))],
        game_players: [
          queryStub(
            roster(
              // Levert, ikke godkjent. Ingen «avslutt likevel» kommer forbi denne.
              playerRow(MATE),
              // Ikke levert i det hele tatt — DEN slipper allowMissing forbi.
              playerRow(OTHER, { submitted_at: null }),
            ),
          ),
        ],
      });

      expect(
        await endGame().finishRound(GAME, { allowMissing: true }),
      ).toEqual({
        ok: false,
        reason: 'not-all-approved',
        blockedUserIds: [MATE],
      });
    });

    it('stopper en godkjenning uten levering — vakten er eksplisitt, ikke strukturell', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow({ require_peer_approval: true }))],
        game_players: [
          queryStub(
            // Kombinasjonen er uoppnåelig i dag (`reopenScorecard` nuller begge
            // feltene i samme UPDATE). Den er med fordi webbens invariant holdes
            // av dataformen alene: nuller en fremtidig sti bare `submitted_at`,
            // ville `continue`-en sluppet raden stille gjennom.
            roster(playerRow(MATE, { submitted_at: null, approved_at: SUBMITTED })),
          ),
        ],
      });

      expect(
        await endGame().finishRound(GAME, { allowMissing: true }),
      ).toEqual({
        ok: false,
        reason: 'not-all-approved',
        blockedUserIds: [MATE],
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Skrivingene
  // ───────────────────────────────────────────────────────────────────────────

  describe('skriverekkefølge', () => {
    it('skriver frafall, så kåring, så status-flipp', async () => {
      const { queryStub, routeFrom } = mocks();
      const wdUpdate = queryStub({ data: [{ user_id: MATE }], error: null });
      const winners = queryStub({ data: [{ position: 1 }], error: null });
      const flip = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow()), queryStub(WD_GATE), flip],
        game_players: [
          wdUpdate,
          queryStub(
            roster(playerRow(ME), playerRow(MATE, { withdrawn_at: SUBMITTED })),
          ),
        ],
        game_side_winners: [winners],
      });

      expect(
        await endGame().finishRound(GAME, {
          allowMissing: true,
          withdrawUserIds: [MATE],
          sideWinners: [
            { category: 'longest_drive', position: 1, winner_user_id: ME },
          ],
        }),
      ).toEqual({ ok: true, alreadyFinished: false });

      expect(tablesTouched()).toEqual([
        // 1. porten
        'games',
        // 2–3. frafallet (rosterActions leser spillet før sitt eget skriv)
        'games',
        'game_players',
        // 4. rosteret leses ETTER frafallet, ellers blokkerer den trukne fortsatt
        'game_players',
        // 5. kåringen FØR flippen — en feil her etterlater spillet `active`
        'game_side_winners',
        // 6. flippen
        'games',
      ]);
    });

    it('flipper ikke når kåringen feilet — spillet står igjen aktivt for retry', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow())],
        game_players: [queryStub(roster(playerRow(ME)))],
        game_side_winners: [
          queryStub({ data: null, error: { message: 'boom' } }),
        ],
      });

      expect(
        await endGame().finishRound(GAME, {
          sideWinners: [
            { category: 'closest_to_pin', position: 1, winner_user_id: null },
          ],
        }),
      ).toEqual({ ok: false, reason: 'db-winners', message: 'boom' });
      // Ingen andre `games`-runde: flippen ble aldri forsøkt.
      expect(tablesTouched()).toEqual(['games', 'game_players', 'game_side_winners']);
    });

    it('melder rls-denied når Postgres avviser kåringen', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow())],
        game_players: [queryStub(roster(playerRow(ME)))],
        game_side_winners: [
          queryStub({
            data: null,
            error: { message: 'insufficient_privilege', code: '42501' },
          }),
        ],
      });

      const result = await endGame().finishRound(GAME, {
        sideWinners: [
          { category: 'longest_drive', position: 1, winner_user_id: ME },
        ],
      });
      expect(result).toMatchObject({ ok: false, reason: 'rls-denied' });
    });
  });

  describe('kåringen', () => {
    it('sender én rad per slot, med null for «Ingen kvalifiserte»', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const winners = queryStub({
        data: [{ position: 1 }, { position: 2 }, { position: 1 }],
        error: null,
      });
      routeFrom({
        games: [queryStub(gameRow()), queryStub(ONE_ROW)],
        game_players: [queryStub(roster(playerRow(ME)))],
        game_side_winners: [winners],
      });

      await endGame().finishRound(GAME, {
        sideWinners: [
          { category: 'longest_drive', position: 1, winner_user_id: ME },
          // Samme spiller på en annen SLOT — `position` er hull, ikke plassering.
          { category: 'longest_drive', position: 2, winner_user_id: ME },
          { category: 'closest_to_pin', position: 1, winner_user_id: null },
        ],
      });

      const [rows, options] = stepArgs(winners, 'upsert')[0]!;
      expect(rows).toEqual([
        {
          game_id: GAME,
          category: 'longest_drive',
          position: 1,
          winner_user_id: ME,
        },
        {
          game_id: GAME,
          category: 'longest_drive',
          position: 2,
          winner_user_id: ME,
        },
        {
          game_id: GAME,
          category: 'closest_to_pin',
          position: 1,
          // «Ingen kvalifiserte» er et VALG som skal persisteres, ikke en
          // manglende verdi som kan utelates.
          winner_user_id: null,
        },
      ]);
      // PK-en er arbiteren — uten den ville en retry duplisert i stedet for å
      // overskrive.
      expect(options).toEqual({ onConflict: 'game_id,category,position' });
      // Uten `.select()` finnes det ikke noe radantall å sjekke (trap 2).
      expect(stepArgs(winners, 'select')).toEqual([['position']]);
    });

    it('hopper over kåringen helt når runden ikke har sideturnering', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow()), queryStub(ONE_ROW)],
        game_players: [queryStub(roster(playerRow(ME)))],
        // Ingen `game_side_winners` rigget: en runde mot tabellen ville kastet.
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: true,
        alreadyFinished: false,
      });
    });
  });

  describe('status-flippen', () => {
    it('skriver finished + ended_at bak en optimistisk lås', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      const flip = queryStub(ONE_ROW);
      routeFrom({
        games: [queryStub(gameRow()), flip],
        game_players: [queryStub(roster(playerRow(ME)))],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: true,
        alreadyFinished: false,
      });

      const patch = stepArgs(flip, 'update')[0]![0] as Record<string, unknown>;
      expect(patch.status).toBe('finished');
      expect(typeof patch.ended_at).toBe('string');
      expect(filtersOf(flip)).toEqual([
        `eq(id,${GAME})`,
        // Låsen webben ikke har: uten den skriver et dobbelttrykk et nytt
        // avslutningstidspunkt oppå det gamle.
        'eq(status,active)',
      ]);
      expect(stepArgs(flip, 'select')).toEqual([['id']]);
    });

    it('leser tapt lås som idempotent suksess når spillet alt er avsluttet', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [
          queryStub(gameRow()),
          queryStub(ZERO_ROWS),
          queryStub({ data: { status: 'finished' }, error: null }),
        ],
        game_players: [queryStub(roster(playerRow(ME)))],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: true,
        alreadyFinished: true,
      });
    });

    it('leser 0 rader som avslag når spillet IKKE er avsluttet', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [
          queryStub(gameRow()),
          queryStub(ZERO_ROWS),
          // Fortsatt aktivt: skrivingen ble nektet, ikke utført av noen andre.
          queryStub({ data: { status: 'active' }, error: null }),
        ],
        game_players: [queryStub(roster(playerRow(ME)))],
      });

      expect(await endGame().finishRound(GAME)).toEqual({
        ok: false,
        reason: 'no-rows',
      });
    });
  });

  describe('frafall', () => {
    it('avviser frafall i et format som ikke støtter det', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        // Texas scramble: delt lag-kort, så et frafall har ingen scoring-effekt
        // og `supportsWithdrawal` sier nei.
        games: [queryStub(gameRow({ game_mode: 'texas_scramble' }))],
      });

      expect(
        await endGame().finishRound(GAME, { withdrawUserIds: [MATE] }),
      ).toEqual({
        ok: false,
        reason: 'withdrawal-unsupported',
        blockedUserIds: [MATE],
      });
      expect(tablesTouched()).toEqual(['games']);
    });

    it('stopper med db-withdraw når et frafalls-skriv feiler', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({
        games: [queryStub(gameRow()), queryStub(WD_GATE)],
        game_players: [queryStub({ data: null, error: { message: 'boom' } })],
      });

      expect(
        await endGame().finishRound(GAME, {
          allowMissing: true,
          withdrawUserIds: [MATE],
        }),
      ).toEqual({
        ok: false,
        reason: 'db-withdraw',
        blockedUserIds: [MATE],
        message: 'boom',
      });
    });
  });
});
