'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import {
  exceedsPersonalMatchCap,
  exceedsPersonalPlayerCap,
} from '@/lib/cup/limits';
import { ALLOWANCE_DEFAULTS } from '@/lib/cup/allowance';
import { teeGenderOf } from '@/lib/games/teeGender';
import { isTeeOffInPast } from '@/lib/games/gamePayload';
import { resolveScheduledTeeOffAt } from '@/lib/cup/splitDayLineup';
import type { GameModeConfig } from '@/lib/scoring/modes/types';
import type { CupBundleFormat, PlannedBundleMatch, PlannedMatch } from '@/lib/cup/cupPairing';

/**
 * Batch-opprettelse av cup-matcher fra en generert plan (#219, fase 4; #1441
 * F3b: splittet-cup-dag-bunten).
 *
 * Speiler den manuelle per-match-stien (`createGameInternal` med `intent=cup`):
 * hver match blir en `games`-rad med status `'scheduled'`, `tournament_id`-FK og
 * `tournament_match_label`, pluss `game_players` med `team_number` 1/2 og
 * `status='active'`. `course_handicap` settes IKKE her — det fryses når runden
 * faktisk startes, akkurat som for enkelt-opprettede cup-matcher. Allowance per
 * format hentes fra cup-radens lagrede kolonner (samme verdier wizarden ville
 * pre-fylt). Kolonner med DB-default (require_peer_approval, registration_*,
 * side_*) utelates bevisst og arves fra schema-default — `score_visibility`
 * likeså for ORDINÆRE matcher (se `isBundleMatch` under).
 *
 * To-pass insert (#1441, D3/D4): en bunt-match uten `sourceId` (greensome/
 * best-ball-host) MÅ eksistere i DB før en avledet singles-match kan peke på
 * den via `source_game_id` — matchene i `input.matches` splittes derfor i
 * «host»-en (uten `sourceId`) og «avledet»-en (med), og host-passet kjører
 * FØR det avledede passet. De tre eldre presetene har ingen avledede matcher
 * (`sourceId` er alltid `undefined`) og går uendret gjennom kun host-passet —
 * bit-for-bit samme oppførsel som før #1441.
 */

const MATCH_LABEL_MAX = 80;
const GAME_NAME_MAX = 120;
// Allowance defaults imported from @/lib/cup/allowance (ALLOWANCE_DEFAULTS) — #809.

type CupAllowancePcts = {
  fourball: number;
  foursomes: number;
  greensome: number;
  chapman: number;
  gruesome: number;
  /**
   * #1441 (D4/D11) ASSUMPTION: `tournaments` har ingen egen
   * `best_ball_allowance_pct`-kolonne (ingen migrasjon la til én — 0153/0154
   * dekker kun win/tie-poeng + sidepoeng) — og best_ball ER fourball spilt
   * som slagspill, med samme WHS-default (85 %, `ALLOWANCE_DEFAULTS.fourball
   * === ALLOWANCE_DEFAULTS.bestBall`). Kilde, i prioritert rekkefølge (F3c):
   * `CupBatchInput.bestBallAllowancePct` (splittet-cup-dag-wizardens eget
   * felt, default 85 der) → cupens `fourball_allowance_pct`-override (default
   * 85 når cupen ikke har satt en). Splittet-cup-dag-bunten bruker ALDRI
   * `fourball_matchplay` som eget sesjonsformat (bunten er
   * greensome+best_ball+singles, se `cupTemplates.ts`), så gjenbruket
   * kolliderer aldri med en faktisk fourball-matches egen allowance i samme
   * cup.
   */
  bestBall: number;
};

/**
 * Bygger mode_config i samme form som de manuelt opprettede cup-matchene lagrer
 * (verifisert mot prod): singles = `{kind, team_size:1}`, 2v2-format =
 * `{kind, team_size:2, teams_count:2, allowance_pct}`. best_ball (#1441, D4)
 * og greensomes `team_strokes_override` (#1441, D10) er splittet-cup-dagens
 * tilskudd.
 */
function cupMatchModeConfig(
  format: CupBundleFormat,
  allowances: CupAllowancePcts,
  teamStrokesOverride?: { team1: number; team2: number },
): GameModeConfig {
  if (format === 'singles_matchplay') {
    return { kind: 'singles_matchplay', team_size: 1 } as GameModeConfig;
  }
  if (format === 'best_ball') {
    // #1441 (D4/D11): standard `best_ball`-modusen har INGEN `allowance_pct`
    // i sin `GameModeConfig` (motoren bruker rå courseHandicap) —
    // cup-laget legger feltet på likevel, fordi `computeCupBestBallAward`
    // (cup-EGEN scoring, ikke motorens `compute()`) leser det derfra for å
    // anvende WHS-allowance før netto-lagtotal-sammenligningen.
    return {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowances.bestBall,
    } as GameModeConfig;
  }
  const allowance_pct =
    format === 'fourball_matchplay'
      ? allowances.fourball
      : format === 'foursomes_matchplay'
        ? allowances.foursomes
        : format === 'greensome_matchplay'
          ? allowances.greensome
          : format === 'chapman_matchplay'
            ? allowances.chapman
            : allowances.gruesome; // gruesome_matchplay
  return {
    kind: format,
    team_size: 2,
    teams_count: 2,
    allowance_pct,
    // #1441 (D10): kun greensome forstår feltet (arrangørens manuelle
    // lag-slag) — andre lag-format ignorerer det bevisst, se
    // `cupMatchModeConfig`s JSDoc og `greensomeMatchplay.ts`.
    ...(format === 'greensome_matchplay' && teamStrokesOverride
      ? { team_strokes_override: teamStrokesOverride }
      : {}),
  } as GameModeConfig;
}

// teeGenderOf imported from @/lib/games/teeGender (#809).

/**
 * Én match i batch-inputen: enten en av de tre eldre presetenes
 * `PlannedMatch` (aldri `sourceId`/bunt-segment) eller splittet-cup-dagens
 * `PlannedBundleMatch` (#1441, D4). `teamStrokesOverride` (D10) er IKKE en
 * del av `cupPairing.ts`s rene planleggingstyper — `generateSplitDayPlan` vet
 * ingenting om arrangørens manuelt tastede lag-slag, det er et felt kalleren
 * (den framtidige oppstillings-editoren) legger på FØR den sender planen hit.
 */
export type CupBatchMatch = (PlannedMatch | PlannedBundleMatch) & {
  teamStrokesOverride?: { team1: number; team2: number };
};

export type CupBatchInput = {
  tournamentId: string;
  courseId: string;
  teeBoxId: string;
  matches: CupBatchMatch[];
  /**
   * #1441 (F3c, D4/D11): «Handicap best ball (%)» fra splittet-cup-dag-
   * wizarden, cup-dag-bredt (ikke per match). Når satt overstyrer den
   * `allowances.bestBall` under i stedet for å gjenbruke cupens lagrede
   * `fourball_allowance_pct` (se `CupAllowancePcts.bestBall`s JSDoc for
   * hvorfor det gjenbruket eksisterer) — de tre eldre presetene sender aldri
   * dette feltet (deres wizard-steg viser det ikke), så `undefined` betyr
   * «ingen bunt i denne batchen, eller organisatoren lot standarden stå».
   */
  bestBallAllowancePct?: number;
  /**
   * #1441 (owner-QA, F3d): «det er ingen steder å legge inn tee-off. det
   * mangler i cup-veiviseren.» Cup-STARTEN — flight 1 sin tee-off, ISO (Oslo→
   * UTC allerede konvertert av wizarden via `parseOsloDateTimeLocal`).
   * `resolveScheduledTeeOffAt` (lib/cup/splitDayLineup.ts) sprer den ut per
   * match: samme tidspunkt for alle matcher i de tre eldre presetene (som
   * ikke har noe flight-konsept), forskjøvet 10 min per flight for
   * splittet-cup-dagens bunt. `undefined` = feltet stod tomt → NULL på alle
   * matchene (dagens oppførsel, organisatoren starter rundene manuelt).
   */
  scheduledTeeOffAt?: string;
};

export type CupBatchError = { error: string };

/**
 * True for en bunt-match (#1441, D12): segment ≠ 'full', eller en
 * `sourceId` (avledet). Slike matcher settes med `score_visibility='reveal'`
 * — ordinære matcher (alle tre eldre presetene) beholder DB-default 'live'
 * ved å utelate feltet fra inserten.
 */
function isBundleMatch(match: CupBatchMatch): boolean {
  return (match.segment !== undefined && match.segment !== 'full') || Boolean(match.sourceId);
}

function isNonNegativeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * Returnerer `{ error }` ved validerings-/DB-feil. Ved suksess redirecter den
 * til cup-detalj-siden (kaster NEXT_REDIRECT — kall-siden navigerer videre).
 */
export async function createCupMatchesFromPlan(
  input: CupBatchInput,
): Promise<CupBatchError> {
  const { tournamentId, courseId, teeBoxId, matches, bestBallAllowancePct, scheduledTeeOffAt } =
    input;

  const supabase = await getServerClient();
  // #524/#526: klubb-cup styres av klubb-admin (eller global admin); personlig
  // cup av skaperen (eller global admin). Gaten slår opp cupens group_id; RLS
  // (0089 + 0090) er backstop. isAdmin styrer cap-bypass under.
  const { userId, isAdmin } = await requireAdminOrClubAdminOfCup(
    supabase,
    tournamentId,
  );

  if (!courseId || !teeBoxId) return { error: 'missing_course' };
  if (!matches || matches.length === 0) return { error: 'no_matches' };

  // #1441 (D10): valider manuelle lag-slag FØR noe skrives — malformed input
  // skal aldri kunne stå igjen halvveis i en batch. «Begge felt satt eller
  // ingen» håndheves implisitt: mangler ett, feiler tallsjekken på det.
  for (const m of matches) {
    if (m.teamStrokesOverride === undefined) continue;
    const { team1, team2 } = m.teamStrokesOverride;
    if (!isNonNegativeInteger(team1) || !isNonNegativeInteger(team2)) {
      return { error: 'invalid_team_strokes_override' };
    }
  }

  // #1441 (F3c): «Handicap best ball (%)» — samme 0..100-heltalls-kontrakt
  // som de fem allowance-feltene i createTournamentDraft (parseAllowancePct),
  // men her er inputen allerede et tall (client-side wizard-state, ikke en
  // form-streng) — valider direkte i stedet for å gå via parseren.
  if (
    bestBallAllowancePct !== undefined &&
    (!Number.isInteger(bestBallAllowancePct) || bestBallAllowancePct < 0 || bestBallAllowancePct > 100)
  ) {
    return { error: 'invalid_best_ball_allowance' };
  }

  // #1441 (owner-QA, F3d): cup-start tee-off — samme «parses + ikke i
  // fortiden»-kontrakt som opprett-spill-actionen (lib/games/gamePayload.ts),
  // men her er feltet ALLTID valgfritt (aldri «publish»-required) — en tom
  // verdi er gyldig og betyr NULL på alle matchene lenger nede.
  if (scheduledTeeOffAt !== undefined) {
    if (Number.isNaN(new Date(scheduledTeeOffAt).getTime())) {
      return { error: 'invalid_tee_off' };
    }
    if (isTeeOffInPast(scheduledTeeOffAt)) {
      return { error: 'tee_off_in_past' };
    }
  }

  // #1441 (D3): to-pass — host-matcher (uten `sourceId`) må finnes i DB før
  // avledede matcher kan peke på dem via `source_game_id`. En `sourceId` som
  // ikke matcher en `id` blant HOST-matchene i DENNE planen er en manipulert
  // payload → avvis før noe insertes (ingen batch å rulle tilbake).
  const hostMatches = matches.filter((m) => !m.sourceId);
  const derivedMatches = matches.filter((m) => m.sourceId);
  const hostPlanIds = new Set(hostMatches.map((m) => m.id));
  for (const m of derivedMatches) {
    if (!hostPlanIds.has(m.sourceId as string)) {
      return { error: 'invalid_source_match' };
    }
  }

  const { data: cup, error: cupErr } = await supabase
    .from('tournaments')
    .select('name, status, group_id, fourball_allowance_pct, foursomes_allowance_pct, greensome_allowance_pct, chapman_allowance_pct, gruesome_allowance_pct')
    .eq('id', tournamentId)
    .maybeSingle();
  if (cupErr || !cup) return { error: 'not_found' };
  if (cup.status !== 'draft') return { error: 'not_draft' };

  // Klubb-cup: matchene skal binde cupen til klubben (group_id på games) og kun
  // inneholde klubbmedlemmer. Pickeren tilbyr bare medlemmer, så en ikke-medlem
  // her betyr manipulert payload → avvis (guardrail, RLS på games er creator-
  // basert og fanger ikke dette).
  const groupId = (cup.group_id as string | null) ?? null;
  if (groupId) {
    const { data: memberRows } = await getAdminClient()
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    const memberIds = new Set((memberRows ?? []).map((m) => m.user_id as string));
    const allInClub = matches.every((m) =>
      [...m.side1, ...m.side2].every((uid) => memberIds.has(uid)),
    );
    if (!allInClub) return { error: 'not_members' };
  } else if (!isAdmin) {
    // Personlig cup, ikke-admin: håndhev «1 helg»-tak (#526, hevet til 16
    // matcher i #1441 — se lib/cup/limits.ts). Teller eksisterende + nye
    // (`matches.length` inkluderer BÅDE host- og avledede matcher — en
    // splittet-cup-dag-bunt på 4 matcher per flight teller alle 4, ikke bare
    // host-ene), så semantikken «≤16 matcher / ≤24 deltakere i cupen» holder
    // selv ved re-generering. Match-taket er bindende i praksis. Admin
    // hopper over (uncapped) — derfor `!isAdmin`-grenen.
    // Tellingene bruker admin-client: game_players-SELECT-RLS krever at man er
    // spiller i kampen (is_in_game), så en skaper som ikke selv spiller ville
    // lest 0 eksisterende deltakere og undertelt taket. Skaperen er allerede
    // gatet (requireAdminOrTournamentCreator), så admin-client er trygt her.
    const admin = getAdminClient();
    const { data: existingGames } = await admin
      .from('games')
      .select('id')
      .eq('tournament_id', tournamentId);
    const existingGameIds = (existingGames ?? []).map((g) => g.id as string);

    let existingPlayerIds: string[] = [];
    if (existingGameIds.length > 0) {
      const { data: existingPlayers } = await admin
        .from('game_players')
        .select('user_id')
        .in('game_id', existingGameIds);
      existingPlayerIds = (existingPlayers ?? []).map(
        (p) => p.user_id as string,
      );
    }

    const totalMatches = existingGameIds.length + matches.length;
    if (exceedsPersonalMatchCap(totalMatches, isAdmin)) {
      return { error: 'too_many_matches' };
    }

    const newPlayerIds = matches.flatMap((m) => [...m.side1, ...m.side2]);
    const distinctPlayers = new Set([...existingPlayerIds, ...newPlayerIds])
      .size;
    if (exceedsPersonalPlayerCap(distinctPlayers, isAdmin)) {
      return { error: 'too_many_players' };
    }
  }

  const fourballPct =
    (cup.fourball_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.fourball;
  const foursomesPct =
    (cup.foursomes_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.foursomes;
  const greensomePct =
    (cup.greensome_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.greensome;
  const chapmanPct =
    (cup.chapman_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.chapman;
  const gruesomePct =
    (cup.gruesome_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.gruesome;
  const allowances: CupAllowancePcts = {
    fourball: fourballPct,
    foursomes: foursomesPct,
    greensome: greensomePct,
    chapman: chapmanPct,
    gruesome: gruesomePct,
    // #1441 (D4/D11, F3c): splittet-cup-dag-wizardens «Handicap best ball
    // (%)»-felt vinner når satt; ellers gjenbrukes cupens fourball-override
    // (se `CupAllowancePcts.bestBall`s JSDoc — bunten bruker aldri
    // `fourball_matchplay` som eget sesjonsformat, så ingen kollisjon).
    bestBall: bestBallAllowancePct ?? fourballPct,
  };

  // Resolve tee_gender per player from their profile in one round-trip.
  const userIds = Array.from(
    new Set(matches.flatMap((m) => [...m.side1, ...m.side2])),
  );
  const { data: roster } = await supabase
    .from('users')
    .select('id, gender')
    .in('id', userIds);
  const genderById = new Map<string, string | null>(
    (roster ?? []).map((u) => [
      u.id as string,
      (u.gender as string | null) ?? null,
    ]),
  );

  const cupName = cup.name as string;

  // Løkka er ikke-atomisk: hver match er en egen games- + game_players-insert.
  // Feiler én av dem midtveis, er tidligere matchers rader allerede committet.
  // Samle alle innsatte game-id-er og rull hele batchen tilbake ved feil, ellers
  // blir en halvbygd cup liggende som eier ikke kan rydde (#675; samme symptom
  // som #641). game_players ryddes av FK `on delete cascade` (0001) når
  // games-raden slettes. Bruker request-klienten — games-DELETE-policyen (0071)
  // dekker oppretterens egne rader. #1441: samler id-er fra BEGGE pass — en
  // host slettet her CASCADE-er allerede sine avledede (0151), men vi samler
  // alle likevel og sletter alle via samme `.in(...)`; det andre delete-forsøket
  // på en allerede-CASCADE-fjernet rad er en harmløs 0-rows-affected no-op.
  const insertedGameIds: string[] = [];
  const rollbackBatch = async () => {
    if (insertedGameIds.length > 0) {
      await supabase.from('games').delete().in('id', insertedGameIds);
    }
  };

  /**
   * Insetter ÉN match (games-rad + game_players-rader). `sourceGameId` er kun
   * satt for pass 2 (avledede matcher, #1441 D3). Feil returneres som
   * `{ error }` i stedet for å kaste — kalleren avgjør rollback selv (samme
   * som løkka gjorde inline før to-pass-splitten).
   */
  async function insertMatch(
    match: CupBatchMatch,
    sourceGameId: string | undefined,
  ): Promise<{ gameId: string } | CupBatchError> {
    const name = `${cupName} – ${match.label}`.slice(0, GAME_NAME_MAX);
    const bundle = isBundleMatch(match);
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        name,
        course_id: courseId,
        tee_box_id: teeBoxId,
        status: 'scheduled',
        game_mode: match.format,
        mode_config: cupMatchModeConfig(match.format, allowances, match.teamStrokesOverride),
        created_by: userId,
        tournament_id: tournamentId,
        tournament_match_label: match.label.slice(0, MATCH_LABEL_MAX),
        // Klubb-cup: bind match-spillet til klubben (data-konsistens). Null for
        // frittstående. Kolonnen er nullable (0075).
        group_id: groupId,
        // #1441 (D1): hull-i-scope for matchen — 'full' for alle tre eldre
        // presetene (og for splittet-cup-dagens greensome-host, som spiller
        // front9 men vet det via `match.segment` selv), front9/back9 for
        // bunt-matchene `generateSplitDayPlan` satte segment på.
        hole_segment: match.segment ?? 'full',
        // #1441 (D12): kun bunt-matcher gates blinde — ordinære matcher
        // utelater feltet og arver DB-default 'live' (dagens oppførsel).
        ...(bundle ? { score_visibility: 'reveal' } : {}),
        // #1441 (D3): kun avledede matcher peker på en host.
        ...(sourceGameId ? { source_game_id: sourceGameId } : {}),
        // #1441 (owner-QA, F3d): NULL når cup-start-feltet stod tomt (dagens
        // oppførsel — organisatoren starter manuelt). Satt på BÅDE host- og
        // avledede matcher (begge pass) slik at auto-start-maskineriet (E1-
        // fallback + cron-sweeten) faktisk fyrer for splittet-cup-dagens
        // bunt — se `resolveScheduledTeeOffAt`s docstring for forskyvningen.
        scheduled_tee_off_at: resolveScheduledTeeOffAt(scheduledTeeOffAt, match.flightIndex),
      })
      .select('id')
      .single();
    if (gameErr || !game) {
      return { error: 'insert_failed' };
    }

    const gameId = (game as { id: string }).id;
    insertedGameIds.push(gameId);
    const acceptedAt = new Date().toISOString();
    const playerRows = [
      ...match.side1.map((uid) => ({ uid, team: 1 })),
      ...match.side2.map((uid) => ({ uid, team: 2 })),
    ].map(({ uid, team }) => ({
      game_id: gameId,
      user_id: uid,
      team_number: team,
      // En match = én spillegruppe. Uten flight_number bryter team_number 1/2
      // CHECK-constraint game_players_team_flight_consistency (team satt ⇒ flight
      // satt). game_players har INGEN status-kolonne — den lå her før og fikk
      // hele inserten avvist (#641), så cup-generering opprettet 0 spillere.
      flight_number: 1,
      tee_gender: teeGenderOf(genderById.get(uid) ?? null),
      // Admin har bevisst satt opp matchene med valgte spillere → umiddelbart
      // aktive, ingen «Ikke bekreftet»-gate (eier-beslutning, jf. #641).
      accepted_at: acceptedAt,
    }));
    const { error: gpErr } = await supabase
      .from('game_players')
      .insert(playerRows);
    if (gpErr) {
      return { error: 'insert_failed' };
    }

    return { gameId };
  }

  // Pass 1: host-matcher (greensome/best-ball-host for bunten; ALLE matcher
  // for de tre eldre presetene, som aldri har `sourceId`). Må fullføre før
  // pass 2, som mapper plan-lokal id → innsatt game-id via `planIdToGameId`.
  const planIdToGameId = new Map<string, string>();
  for (const match of hostMatches) {
    const outcome = await insertMatch(match, undefined);
    if ('error' in outcome) {
      await rollbackBatch();
      return outcome;
    }
    planIdToGameId.set(match.id, outcome.gameId);
  }

  // Pass 2: avledede matcher (#1441, D3) — `sourceId` er pre-validert mot
  // `hostPlanIds` over, så oppslaget her kan ikke feile i praksis; den
  // defensive grenen dekker kun et host-insert som teoretisk lyktes uten å
  // havne i kartet (kan ikke skje slik koden er skrevet, men vi stoler ikke
  // blindt på det for en batch som skriver til DB).
  for (const match of derivedMatches) {
    const sourceGameId = planIdToGameId.get(match.sourceId as string);
    if (!sourceGameId) {
      await rollbackBatch();
      return { error: 'insert_failed' };
    }
    const outcome = await insertMatch(match, sourceGameId);
    if ('error' in outcome) {
      await rollbackBatch();
      return outcome;
    }
  }

  revalidateTag(`tournament-${tournamentId}`, 'max');
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);
  const locale = await getLocale();
  redirect({
    href: groupId
      ? `/klubber/${groupId}/cup/${tournamentId}?status=matches_generated`
      : `/admin/cup/${tournamentId}?status=matches_generated`,
    locale,
  });
  // redirect() throws NEXT_REDIRECT — unreachable, satisfies return type
  return { error: '' } as CupBatchError;
}
