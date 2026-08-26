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
import {
  cupMatchAllowance,
  type CupAllowancePcts,
} from '@/lib/cup/cupMatchAllowance';
import { teeGenderOf } from '@/lib/games/teeGender';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { calculateCourseHandicap } from '@/lib/scoring/courseHandicap';
import { greensomeTeamHandicap } from '@/lib/scoring/modes/greensomeMatchplay';
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

// CupAllowancePcts + cupMatchAllowance bor i @/lib/cup/cupMatchAllowance
// (#1539/#1551) — denne fila er `'use server'` og kan derfor ikke eksportere
// den rene helperen selv, og invarianten «allowancen bor ett sted» trenger et
// testbart hjem.

/**
 * Bygger mode_config i samme form som de manuelt opprettede cup-matchene lagrer
 * (verifisert mot prod): singles = `{kind, team_size:1}`, 2v2-format =
 * `{kind, team_size:2, teams_count:2, allowance_pct}`. best_ball (#1441, D4)
 * og greensomes `team_strokes_override` (#1441, D10) er splittet-cup-dagens
 * tilskudd.
 *
 * Hvorvidt `allowance_pct` skal med avgjøres IKKE her, men av
 * `cupMatchAllowance` (#1539/#1551) — den er det ene stedet som bestemmer om
 * allowancen bor på `games`-raden eller i mode_config, slik at de to feltene
 * ikke kan settes uavhengig og trekke allowancen to ganger.
 */
function cupMatchModeConfig(
  format: CupBundleFormat,
  allowances: CupAllowancePcts,
  teamStrokesOverride?: { team1: number; team2: number },
  teamStrokesOverrideAuto?: { team1: number; team2: number },
): GameModeConfig {
  if (format === 'singles_matchplay') {
    return { kind: 'singles_matchplay', team_size: 1 } as GameModeConfig;
  }
  const { modeConfigAllowancePct } = cupMatchAllowance(format, allowances);
  if (format === 'best_ball') {
    // #1539/#1551: best_ball bærer allowancen på `games.hcp_allowance_pct`
    // (anvendt ved frysing), ikke her — motoren
    // (`lib/scoring/modes/bestBall.ts`) leser det frosne banehandicapet rått,
    // og `computeCupBestBallAward` gjør nå det samme. Feltet ble tidligere
    // lagret her OG anvendt av cup-poenget, mens kampens egen tavle brukte den
    // frosne verdien — de to flatene viste da ulikt antall slag.
    return {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    } as GameModeConfig;
  }
  return {
    kind: format,
    team_size: 2,
    teams_count: 2,
    allowance_pct: modeConfigAllowancePct,
    // #1441 (D10): kun greensome forstår feltet (arrangørens manuelle
    // lag-slag) — andre lag-format ignorerer det bevisst, se
    // `cupMatchModeConfig`s JSDoc og `greensomeMatchplay.ts`.
    // #1628: forslaget vi selv regnet ut lagres ved siden av overstyringen,
    // slik at runde-starten kan avgjøre om arrangøren har rørt feltet.
    ...(format === 'greensome_matchplay' && teamStrokesOverride
      ? {
          team_strokes_override: teamStrokesOverride,
          ...(teamStrokesOverrideAuto
            ? { team_strokes_override_auto: teamStrokesOverrideAuto }
            : {}),
        }
      : {}),
  } as GameModeConfig;
}

// teeGenderOf imported from @/lib/games/teeGender (#809).

/** Det veiviseren viser per spiller: kjønn (→ tee-sett) + rå HCP-indeks. */
type CupProfile = { gender: string | null; hcpIndex: number };

/**
 * Normaliserer tee-radens rating-kolonner til `TeeBoxRatings` (#1628). Rå
 * `undefined` (kolonne ikke med i raden) må bli `null` — `getRatingForGender`
 * ser bare etter `null`, og et `undefined` slope ville gitt NaN i formelen i
 * stedet for det tiltenkte «teen mangler dette settet»-fallbacket.
 */
function teeRatingsFrom(row: Record<string, unknown>): TeeBoxRatings {
  const num = (key: string): number | null => {
    const value = row[key];
    return typeof value === 'number' ? value : null;
  };
  return {
    slope_mens: num('slope_mens'),
    course_rating_mens: num('course_rating_mens'),
    par_total_mens: num('par_total_mens'),
    slope_ladies: num('slope_ladies'),
    course_rating_ladies: num('course_rating_ladies'),
    par_total_ladies: num('par_total_ladies'),
    slope_juniors: num('slope_juniors'),
    course_rating_juniors: num('course_rating_juniors'),
    par_total_juniors: num('par_total_juniors'),
  };
}

/**
 * Spillehandicapet på planens tee for én spiller — server-sidens kopi av
 * veiviserens `computeSpillehandicap` (GenerateMatchesWizard.tsx). Samme
 * fallback som der: mangler teen ratingsett for spillerens kjønn, brukes den
 * rå HCP-indeksen. Samme koersjon som `GenerateMatches.tsx` gjør på
 * `hcp_index` (`Number(... ?? 0)`), så tallene her og i UI-en er identiske.
 */
function playingHandicapOf(
  profile: CupProfile | undefined,
  tee: TeeBoxRatings,
): number {
  const hcpIndex = profile?.hcpIndex ?? 0;
  const rating = getRatingForGender(tee, teeGenderOf(profile?.gender ?? null));
  if (!rating) return hcpIndex;
  return calculateCourseHandicap({
    hcpIndex,
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
  });
}

/**
 * #1628: forslaget veiviseren pre-fylte greensomens lag-slag-felt med,
 * regnet ut PÅ NYTT server-side. Serveren er fasit ved submit (#1472-
 * prinsippet) — og et forslag klienten kunne ha diktet opp duger ikke som
 * fasit for «har arrangøren rørt feltet?» ved runde-start.
 *
 * Speiler `greensomeDefaultOrFallback` i veiviseren: 60/40-formelen på begge
 * spilleres spillehandicap, og 0 for et par som ikke har nøyaktig to spillere
 * (kan ikke skje med gyldig bunt-output, men skal ikke krasje batchen).
 */
function greensomeAutoTeamStrokes(
  side: string[],
  profiles: Map<string, CupProfile>,
  tee: TeeBoxRatings,
): number {
  if (side.length !== 2) return 0;
  return greensomeTeamHandicap(
    playingHandicapOf(profiles.get(side[0]), tee),
    playingHandicapOf(profiles.get(side[1]), tee),
  );
}

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

/**
 * #1472: input-typen bærer KUN det klienten faktisk eier — cupens id og den
 * fordelte match-planen (side1/side2/segment/sourceId + greensomens
 * `teamStrokesOverride`). Bane/tee/tee-off/best-ball leses server-side fra den
 * lagrede planen (`tournament_plans`, Oppsett-rommet) i stedet for å komme som
 * klient-payload — mindre manipulasjonsflate, og serveren er fasit ved submit.
 */
export type CupBatchInput = {
  tournamentId: string;
  matches: CupBatchMatch[];
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
  const { tournamentId, matches } = input;

  const supabase = await getServerClient();
  // #524/#526: klubb-cup styres av klubb-admin (eller global admin); personlig
  // cup av skaperen (eller global admin). Gaten slår opp cupens group_id; RLS
  // (0089 + 0090) er backstop. isAdmin styrer cap-bypass under.
  const { userId, isAdmin } = await requireAdminOrClubAdminOfCup(
    supabase,
    tournamentId,
  );

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

  // #1472: bane/tee/tee-off/best-ball leses fra den LAGREDE planen (Oppsett-
  // rommet), ikke lenger fra klient-payloaden. Fasit ved submit — planen kan
  // ha blitt endret siden veiviseren ble lastet (annen fane/enhet). SELECT-
  // policyen (0155) dekker authenticated, så request-klienten holder.
  const { data: plan } = await supabase
    .from('tournament_plans')
    .select('course_id, tee_box_id, scheduled_tee_off_at, best_ball_allowance_pct')
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (!plan || !plan.course_id || !plan.tee_box_id) {
    return { error: 'missing_plan' };
  }
  const courseId = plan.course_id as string;
  const teeBoxId = plan.tee_box_id as string;

  // Re-valider teen server-side: den kan ha blitt arkivert eller flyttet til en
  // annen bane etter at planen ble lagret (planen ble ikke oppdatert). En
  // utdatert plan sender arrangøren tilbake til Oppsett, ikke inn i genereringen.
  // Rating-settene (#1628) hentes i samme runde-tur: greensomens auto-forslag
  // regnes ut server-side fra spillehandicapet på nettopp denne teen.
  const { data: teeRow } = await supabase
    .from('tee_boxes')
    .select(
      'course_id, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
    )
    .eq('id', teeBoxId)
    .maybeSingle();
  if (!teeRow || teeRow.course_id !== courseId || teeRow.archived_at !== null) {
    return { error: 'plan_tee' };
  }
  const teeRatings = teeRatingsFrom(teeRow);

  // #1441 (owner-QA, F3d) → #1472: cup-start-tee-off leses nå fra planen. En
  // stale tee-off i fortiden skal sende arrangøren tilbake til Oppsett for å
  // sette et nytt tidspunkt, ikke stille generere med et forbigått start-tid.
  const scheduledTeeOffAt =
    (plan.scheduled_tee_off_at as string | null) ?? undefined;
  if (scheduledTeeOffAt !== undefined && isTeeOffInPast(scheduledTeeOffAt)) {
    return { error: 'tee_off_in_past' };
  }

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
    // #1441 (D4/D11, F3c) → #1472: planens lagrede «Handicap best ball (%)»
    // vinner når satt; ellers gjenbrukes cupens fourball-override (se
    // `CupAllowancePcts.bestBall`s JSDoc — bunten bruker aldri
    // `fourball_matchplay` som eget sesjonsformat, så ingen kollisjon).
    bestBall: (plan.best_ball_allowance_pct as number | null) ?? fourballPct,
  };

  // Resolve tee_gender + HCP-indeks per player from their profile in one
  // round-trip. Admin-client (#1628): `hcp_index` er input til greensomens
  // auto-forslag, og en klubb-admin ser ikke fremmede `users`-rader under RLS
  // — samme grep og begrunnelse som deltakerlista i `GenerateMatches.tsx`.
  const userIds = Array.from(
    new Set(matches.flatMap((m) => [...m.side1, ...m.side2])),
  );
  const { data: roster, error: rosterError } = await getAdminClient()
    .from('users')
    .select('id, gender, hcp_index')
    .in('id', userIds);
  // #1718: en feilet lesing ga tidligere et tomt kart, og HELE batchen ble
  // generert med 'mens'-tee og hcpIndex 0 — stille feil slag for alle. Stopp
  // før første insert; ingenting er skrevet, så det er ingenting å kompensere.
  // (En DELVIS rad-mengde er derimot ikke en feil — se `?? null`/`?? 0` under.)
  if (rosterError) {
    console.error('[cup] generateMatches profile read failed', {
      tournamentId,
      error: rosterError,
    });
    return { error: 'profile_read_failed' };
  }
  const profileById = new Map<string, CupProfile>(
    (roster ?? []).map((u) => [
      u.id as string,
      {
        gender: (u.gender as string | null) ?? null,
        // Supabase leverer numerics som string i noen oppsett — samme
        // koersjon som veiviserens `Number(u?.hcp_index ?? 0)`.
        hcpIndex: Number((u as { hcp_index?: number | string }).hcp_index ?? 0),
      },
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
    // #1628: bare greensome-matcher med en overstyring får et auto-spor —
    // uten overstyring er det ingenting å avgjøre «urørt» for.
    const teamStrokesOverrideAuto =
      match.format === 'greensome_matchplay' && match.teamStrokesOverride
        ? {
            team1: greensomeAutoTeamStrokes(match.side1, profileById, teeRatings),
            team2: greensomeAutoTeamStrokes(match.side2, profileById, teeRatings),
          }
        : undefined;
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        name,
        course_id: courseId,
        tee_box_id: teeBoxId,
        status: 'scheduled',
        game_mode: match.format,
        mode_config: cupMatchModeConfig(
          match.format,
          allowances,
          match.teamStrokesOverride,
          teamStrokesOverrideAuto,
        ),
        // #1539/#1551: settes ALLTID eksplisitt, aldri arvet fra DB-defaulten
        // (100). For best_ball er dette hjemmet til allowancen — den anvendes
        // når `startScheduledGame` fryser `game_players.course_handicap`, og
        // alle flater leser den frosne verdien rått etterpå. For de øvrige
        // formatene er 100 en aktiv beslutning: de anvender sin egen
        // `mode_config.allowance_pct` ved beregning, oppå et rått frosset tall.
        hcp_allowance_pct: cupMatchAllowance(match.format, allowances).hcpAllowancePct,
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
      tee_gender: teeGenderOf(profileById.get(uid)?.gender ?? null),
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
