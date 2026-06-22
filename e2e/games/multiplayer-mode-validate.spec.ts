import { test, expect, type BrowserContext, type Page, type Locator } from '@playwright/test';
import {
  envReady,
  skipReason,
  adminClient,
  ADMIN_EMAIL,
  PLAYER_EMAIL,
  signInViaOtp,
  seedFinishedModeGame,
  seedEphemeralPlayers,
  deleteEphemeralPlayers,
  cleanupTestGame,
  type EphemeralPlayer,
} from '../_helpers/games';

/**
 * Per-modus finish-and-validate for ≥3-spiller-formater (#848).
 *
 * #736 (`lifecycle-validate.spec.ts`) dekket modusene som med 2 spillere
 * rendrer head-to-head-duellen. Disse fem modusene KREVER ≥3 spillere og
 * rendrer derfor sin EKTE podium/leaderboard-visning (ikke duellen) — render-
 * stier #736 aldri traff. En aggregerings-/render-regresjon i NinesView,
 * AceyDeuceyView, RoundRobinView, WolfView eller BingoBangoBongoView ville
 * passert grønt uten denne.
 *
 * Samme prinsipp som #736: vi seeder et FERDIG spill med en kjent, skjev
 * score-matrise og asserter at leaderboard-DOM matcher et UAVHENGIG hardkodet
 * orakel — IKKE et `lib/scoring`-tall regnet ved test-tid (det ville maskert en
 * aggregerings-regresjon ved å regne «forventet» med samme buggy kode). Hvert
 * orakel er hånd-utledet fra modus-regelen (se kommentar per test) og kryss-
 * sjekket mot den rene `buildModeResultFromData`-pipelinen i utvikling.
 *
 * Orakel-triks (arvet fra #736): alle spillere får LIK course_handicap (18), så
 * netto reduseres til brutto og blir uavhengig av banens stroke-index. Round
 * Robin bruker 85 %-allowance, men `applyAllowance(18, 85)` = 15 for ALLE, så
 * per-side best-net-sammenligning reduseres også der til brutto.
 *
 * Score-akser: A (admin) spiller lavest, så A vinner alle poeng-modusene. De
 * øvrige plassene fylles av spiller + efemere roster-brukere med kjente navn.
 *
 * Env-gardet (staging), serial så modusene deler én admin-innlogging.
 */
test.describe('Multiplayer finish-and-validate (#848)', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(!envReady, skipReason);

  let ctx: BrowserContext;
  let page: Page;
  let adminId = '';
  let playerId = '';
  let adminName = '';
  // Tre efemere roster-brukere (C/D + en buffer) med kjente, asserterbare navn.
  let ephemerals: EphemeralPlayer[] = [];
  const gameIds: string[] = [];

  const HCP = 18; // equal handicaps → net comparison == gross comparison

  test.beforeAll(async ({ browser }) => {
    const admin = adminClient();
    const a = await admin
      .from('users')
      .select('id, name, nickname')
      .ilike('email', ADMIN_EMAIL!)
      .maybeSingle<{ id: string; name: string | null; nickname: string | null }>();
    const p = await admin
      .from('users')
      .select('id, name, nickname')
      .ilike('email', PLAYER_EMAIL!)
      .maybeSingle<{ id: string; name: string | null; nickname: string | null }>();
    if (!a.data || !p.data) throw new Error('admin/player test users not seeded');
    adminId = a.data.id;
    playerId = p.data.id;
    adminName = (a.data.nickname?.trim() || a.data.name?.trim()) ?? '';
    // Resolved once so the winner-identity assertions are unconditional (an
    // empty name would otherwise silently skip the "A is the winner" check).
    expect(adminName, 'admin display name resolved').toBeTruthy();

    // Trenger inntil 2 ekstra roster-spillere (4-spiller-modusene). Seed 2 med
    // hcp_index 18 (samme som admin/player) — efemere brukere logger aldri inn,
    // de er bare roster-fyll.
    ephemerals = await seedEphemeralPlayers(2, { hcpIndex: 18 });

    ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/login?next=/');
    await signInViaOtp(page, ADMIN_EMAIL!);
  });

  test.afterAll(async () => {
    for (const id of gameIds) await cleanupTestGame(id);
    await deleteEphemeralPlayers(ephemerals.map((e) => e.id));
    await ctx?.close();
  });

  /** {hole: {userId: strokes}} der hver userId skyter en fast verdi på hull 1..n. */
  function flatMatrix(
    n: number,
    perUser: Record<string, number>,
  ): Record<number, Record<string, number>> {
    const m: Record<number, Record<string, number>> = {};
    for (let h = 1; h <= n; h++) m[h] = { ...perUser };
    return m;
  }

  /** Den store score-num-en i rad `rank` (1-indeksert) i en leaderboard-<ul>. */
  function scoreInRank(list: Locator, rank: number): Locator {
    return list.locator('li').nth(rank - 1).locator('.score-num');
  }

  test('nines: A=90, B=54, C=18 (3-way 5/3/1 split, strict order) @lifecycle', async () => {
    test.slow();
    // RULE (nines, net): hvert hull deler ut pott [5,3,1] på effektiv-score-rang
    // (lavest=5, midt=3, høyest=1). Equal hcp ⇒ rang = brutto-rang. A=3 (lavest)
    // hver hull → 5p, B=4 (midt) → 3p, C=5 (høyest) → 1p. Over 18 hull, ingen
    // ties: A=18×5=90, B=18×3=54, C=18×1=18. Strict A>B>C.
    const C = ephemerals[0];
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'nines',
      gameMode: 'nines',
      modeConfig: { kind: 'nines', team_size: 1, nines_variant: 'nines', nines_scoring: 'net' },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
        { userId: C.id, courseHandicap: HCP },
      ],
      scoresByHole: flatMatrix(18, { [adminId]: 3, [playerId]: 4, [C.id]: 5 }),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const list = page.getByTestId('nines-leaderboard');
    await expect(list).toBeVisible();
    // Rows render in rank order: rank1 winner first. Oracle 90 / 54 / 18.
    await expect(scoreInRank(list, 1)).toHaveText('90');
    await expect(scoreInRank(list, 2)).toHaveText('54');
    await expect(scoreInRank(list, 3)).toHaveText('18');
    // Winner identity: A (admin) leads.
    await expect(list.locator('li').first()).toContainText(adminName);
  });

  test('acey_deucey: A=+54 winner, D=−54 loser, B/C tie at 0 @lifecycle', async () => {
    test.slow();
    // RULE (acey deucey, net, 4 players): unik lavest = +3 (ace), unik høyest =
    // −3 (deuce), de to midtre = 0. A=3 (unik lavest) hver hull → +3×18=+54
    // (rank1, 18 aces). D=6 (unik høyest) → −3×18=−54 (rank4, 18 deuces). B=4 og
    // C=5 er alltid de to midtre → 0 hver hull → total 0, delt rank2 (legitim,
    // dokumentert tie — ingen midt-skille i regelen). Vinner+taper entydige.
    const C = ephemerals[0];
    const D = ephemerals[1];
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'acey',
      gameMode: 'acey_deucey',
      modeConfig: { kind: 'acey_deucey', team_size: 1, acey_deucey_scoring: 'net' },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
        { userId: C.id, courseHandicap: HCP },
        { userId: D.id, courseHandicap: HCP },
      ],
      scoresByHole: flatMatrix(18, { [adminId]: 3, [playerId]: 4, [C.id]: 5, [D.id]: 6 }),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const list = page.getByTestId('acey-deucey-leaderboard');
    await expect(list).toBeVisible();
    // Signed totals: +54 (rank1), then two zeros (rank2 tie), then −54 (rank4).
    // U+2212 MINUS SIGN per formatSigned() in AceyDeuceyView.
    await expect(scoreInRank(list, 1)).toHaveText('+54');
    await expect(scoreInRank(list, 4)).toHaveText('−54');
    // The two middle rows are B & C, both exactly 0.
    await expect(scoreInRank(list, 2)).toHaveText('0');
    await expect(scoreInRank(list, 3)).toHaveText('0');
    // Winner identity: A (admin) leads with +54.
    await expect(list.locator('li').first()).toContainText(adminName);
  });

  test('round_robin: A sweeps (18 wins), B/C/D each 6 @lifecycle', async () => {
    test.slow();
    // RULE (round robin, net, 4 players, slots 1-4): 3×6-hulls-segmenter med
    // roterende partnere. Per segment vinner siden med lavest best-net ALLE 6
    // hull (+6 til hver på vinner-siden). Slot1=A (3, lavest) er på vinner-siden
    // i hvert segment → A=18 hull-seire (rank1). Hver av B/C/D partner A i NØYAKTIG
    // ett segment (vinner 6) og er mot A i to (taper 12) → B=C=D=6, 12 tapt.
    //
    // Den 3-veis tien (B/C/D=6) er STRUKTURELT uunngåelig når én spiller
    // dominerer: rotasjonen gir kun 6 til hver av A's tre partnere. Et strikt
    // 4-veis skille er umulig med konstante per-segment-utfall (win-vektoren er
    // alltid en permutasjon av {18,6,6,6} / {12,12,6,6} / {12,12,12,0}). Orakelet
    // er likevel fullt utledet: A=18 entydig vinner, de tre andre nøyaktig 6.
    const C = ephemerals[0];
    const D = ephemerals[1];
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'roundrobin',
      gameMode: 'round_robin',
      modeConfig: { kind: 'round_robin', team_size: 2, teams_count: 2, allowance_pct: 85 },
      players: [
        { userId: adminId, courseHandicap: HCP, teamNumber: 1 },
        { userId: playerId, courseHandicap: HCP, teamNumber: 2 },
        { userId: C.id, courseHandicap: HCP, teamNumber: 3 },
        { userId: D.id, courseHandicap: HCP, teamNumber: 4 },
      ],
      scoresByHole: flatMatrix(18, { [adminId]: 3, [playerId]: 4, [C.id]: 5, [D.id]: 6 }),
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const list = page.getByTestId('round-robin-leaderboard');
    await expect(list).toBeVisible();
    // Big number per row = totalHoleWins. Rank1 = A with 18; the other three = 6.
    await expect(scoreInRank(list, 1)).toHaveText('18');
    await expect(scoreInRank(list, 2)).toHaveText('6');
    await expect(scoreInRank(list, 3)).toHaveText('6');
    await expect(scoreInRank(list, 4)).toHaveText('6');
    // Winner identity: A (admin) leads with 18 hole wins.
    await expect(list.locator('li').first()).toContainText(adminName);
  });

  test('wolf: A=30 winner (lone wins + always-low opp), B/C tie at 6 @lifecycle', async () => {
    test.slow();
    // RULE (wolf, net, 3 players, alle hull = 'lone'): wolf roterer slot1→2→3.
    // n=3 ⇒ lone-gevinst = n×stake = 3; opp-vinst = 1×stake til hver motstander.
    // Stake=1 hele veien (avgjorte hull resetter til 1).
    //   - A (slot1) er wolf på 6 hull, alltid lavest (3) ⇒ lone-vinner ⇒ +3×6=18.
    //   - Når B/C er wolf (12 hull) er A på opp-siden og lavest ⇒ A +1×12=12.
    //   ⇒ A=18+12=30 (rank1).
    //   - B scorer kun når C er wolf (B på opp-side, +1×6=6); når B er wolf taper
    //     B (A lavest). ⇒ B=6. C symmetrisk ⇒ C=6. B/C delt rank2.
    // Seedede choices kreves — uten dem er hvert hull 'pending' (0 poeng).
    const C = ephemerals[0];
    const slotToUser: Record<number, string> = { 1: adminId, 2: playerId, 3: C.id };
    const wolfChoices = Array.from({ length: 18 }, (_, i) => {
      const hole = i + 1;
      const slot = ((hole - 1) % 3) + 1;
      return { holeNumber: hole, wolfUserId: slotToUser[slot], choice: 'lone' as const };
    });
    const { id } = await seedFinishedModeGame({
      nameSuffix: 'wolf',
      gameMode: 'wolf',
      modeConfig: { kind: 'wolf', team_size: 1, teams_count: 3, wolf_scoring: 'net' },
      players: [
        { userId: adminId, courseHandicap: HCP, teamNumber: 1 },
        { userId: playerId, courseHandicap: HCP, teamNumber: 2 },
        { userId: C.id, courseHandicap: HCP, teamNumber: 3 },
      ],
      scoresByHole: flatMatrix(18, { [adminId]: 3, [playerId]: 4, [C.id]: 5 }),
      wolfChoices,
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const list = page.getByTestId('wolf-leaderboard');
    await expect(list).toBeVisible();
    // Big number per row = totalPoints. Oracle: 30 (rank1), then 6, 6 (rank2 tie).
    await expect(scoreInRank(list, 1)).toHaveText('30');
    await expect(scoreInRank(list, 2)).toHaveText('6');
    await expect(scoreInRank(list, 3)).toHaveText('6');
    // Winner identity: A (admin) leads with 30.
    await expect(list.locator('li').first()).toContainText(adminName);
  });

  test('bingo_bango_bongo: A=27, B=18, C=6, D=3 (strict order) @lifecycle', async () => {
    test.slow();
    // RULE (bbb, 4 players): 3 prestasjons-poeng per hull (bingo/bango/bongo),
    // utledet fra `bingo_bango_bongo_holes`-rader, IKKE fra slag. Vi gir alle tre
    // til én spiller per hull (3 poeng/hull):
    //   A: hull 1–9   → 9×3 = 27
    //   B: hull 10–15 → 6×3 = 18
    //   C: hull 16–17 → 2×3 = 6
    //   D: hull 18     → 1×3 = 3
    // Strict 4-veis skille: A>B>C>D. Krever seedede BBB-rader (uten dem 0 poeng).
    const C = ephemerals[0];
    const D = ephemerals[1];
    const award = (h: number, uid: string) => ({
      holeNumber: h,
      bingoUserId: uid,
      bangoUserId: uid,
      bongoUserId: uid,
    });
    const bbb: { holeNumber: number; bingoUserId: string; bangoUserId: string; bongoUserId: string }[] = [];
    for (let h = 1; h <= 9; h++) bbb.push(award(h, adminId));
    for (let h = 10; h <= 15; h++) bbb.push(award(h, playerId));
    for (let h = 16; h <= 17; h++) bbb.push(award(h, C.id));
    bbb.push(award(18, D.id));

    const { id } = await seedFinishedModeGame({
      nameSuffix: 'bbb',
      gameMode: 'bingo_bango_bongo',
      modeConfig: { kind: 'bingo_bango_bongo', team_size: 1 },
      players: [
        { userId: adminId, courseHandicap: HCP },
        { userId: playerId, courseHandicap: HCP },
        { userId: C.id, courseHandicap: HCP },
        { userId: D.id, courseHandicap: HCP },
      ],
      // Slag teller ikke for BBB-poeng, men vi seeder flate scorer så spillet
      // har et fullført scorekort (alle 4 like = ingen påvirkning).
      scoresByHole: flatMatrix(18, { [adminId]: 4, [playerId]: 4, [C.id]: 4, [D.id]: 4 }),
      bingoBangoBongoHoles: bbb,
    });
    gameIds.push(id);

    await page.goto(`/games/${id}/leaderboard`);
    await expect(page.getByText('Noe gikk galt')).toHaveCount(0);

    const list = page.getByTestId('bbb-leaderboard');
    await expect(list).toBeVisible();
    // Big number per row = totalPoints. Strict order 27 / 18 / 6 / 3.
    await expect(scoreInRank(list, 1)).toHaveText('27');
    await expect(scoreInRank(list, 2)).toHaveText('18');
    await expect(scoreInRank(list, 3)).toHaveText('6');
    await expect(scoreInRank(list, 4)).toHaveText('3');
    // Winner identity: A (admin) leads with 27.
    await expect(list.locator('li').first()).toContainText(adminName);
  });
});
