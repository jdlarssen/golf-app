import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { cupMatchAllowance, type CupAllowancePcts } from './cupMatchAllowance';
import { resolveScheduledTeeOffAt } from './splitDayLineup';
import { teeGenderOf } from '@/lib/games/teeGender';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { calculateCourseHandicap } from '@/lib/scoring/courseHandicap';
import { greensomeTeamHandicap } from '@/lib/scoring/modes/greensomeMatchplay';
import type { GameModeConfig } from '@/lib/scoring/modes/types';
import type {
  CupBundleFormat,
  PlannedBundleMatch,
  PlannedMatch,
} from './cupPairing';

/**
 * Innsettings-kjernen for cup-matcher — delt av generer-veiviseren (#219/#1441)
 * og kaptein-uttakets avdekking (#1884).
 *
 * Flyttet hit fra `app/[locale]/admin/cup/[id]/generer/actions.ts` da avdekkingen
 * fikk bruk for nøyaktig samme skriving: en avdekket økt ER en batch matcher,
 * bare med kapteinenes paring i stedet for generatorens. Å duplisere de ~150
 * linjene ville gitt to hjem for hvordan en cup-match ser ut i databasen —
 * mode_config, allowance, tee-kjønn, rollback — og AGENTS.md-felle 4 sier at en
 * regel har ett hjem.
 *
 * Fila er `server-only`, ikke `'use server'`: generer-actions-fila er en
 * action-modul og kan derfor ikke eksportere rene helpere selv. Alt her er
 * uendret oppførsel fra før flyttingen; gating, tak-vakter, plan-lesing og
 * redirect ble værende hos kallerne, som eier sine egne regler.
 */

/** Det veiviseren viser per spiller: kjønn (→ tee-sett) + rå HCP-indeks. */
export type CupProfile = { gender: string | null; hcpIndex: number };

/**
 * Én match i batch-inputen: enten en av de tre eldre presetenes
 * `PlannedMatch` (aldri `sourceId`/bunt-segment) eller splittet-cup-dagens
 * `PlannedBundleMatch` (#1441, D4). `teamStrokesOverride` (D10) er IKKE en
 * del av `cupPairing.ts`s rene planleggingstyper — `generateSplitDayPlan` vet
 * ingenting om arrangørens manuelt tastede lag-slag, det er et felt kalleren
 * legger på FØR den sender planen hit.
 */
export type CupBatchMatch = (PlannedMatch | PlannedBundleMatch) & {
  teamStrokesOverride?: { team1: number; team2: number };
};

export type CupBatchError = { error: string };

const MATCH_LABEL_MAX = 80;
const GAME_NAME_MAX = 120;

/**
 * True for en bunt-match (#1441, D12): segment ≠ 'full', eller en
 * `sourceId` (avledet). Slike matcher settes med `score_visibility='reveal'`
 * — ordinære matcher (alle tre eldre presetene) beholder DB-default 'live'
 * ved å utelate feltet fra inserten.
 */
function isBundleMatch(match: CupBatchMatch): boolean {
  return (
    (match.segment !== undefined && match.segment !== 'full') ||
    Boolean(match.sourceId)
  );
}

/** Plukker tee-ratingsettene ut av en `tee_boxes`-rad. */
export function teeRatingsFrom(row: Record<string, unknown>): TeeBoxRatings {
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
export function cupMatchModeConfig(
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

/** Alt kjernen trenger å vite som IKKE står i selve match-lista. */
export type InsertCupMatchesContext = {
  /**
   * Klienten skrivingen skal gå gjennom. Veiviseren sender request-klienten
   * (RLS-policyene 0071 dekker oppretterens egne rader); avdekkingen sender
   * admin-klienten, siden kapteinen som utløser den ikke er cupens skaper.
   */
  client: SupabaseClient<Database>;
  tournamentId: string;
  cupName: string;
  groupId: string | null;
  courseId: string;
  teeBoxId: string;
  teeRatings: TeeBoxRatings;
  allowances: CupAllowancePcts;
  scheduledTeeOffAt: string | undefined;
  /** `games.created_by` — cupens arrangør, ikke nødvendigvis den som klikket. */
  createdBy: string;
};

export type InsertCupMatchesResult = { gameIds: string[] } | CupBatchError;

/**
 * #1441 (D3): en `sourceId` som ikke peker på en HOST-match i den samme planen
 * er en manipulert payload.
 *
 * Egen eksport fordi rekkefølgen er en del av kontrakten: veiviseren avviser
 * dette FØR den leser cupen, planen og teen, slik at en tuklet payload aldri
 * kommer forbi det første steget. `insertCupMatches` kaller den om igjen for
 * egen del — sjekken er ren og gratis, og kjernen skal ikke stole på at hver
 * framtidig kaller har husket den.
 */
export function hasValidSourceMatches(matches: CupBatchMatch[]): boolean {
  const hostPlanIds = new Set(
    matches.filter((m) => !m.sourceId).map((m) => m.id),
  );
  return matches
    .filter((m) => m.sourceId)
    .every((m) => hostPlanIds.has(m.sourceId as string));
}

/**
 * Setter inn en batch cup-matcher (games + game_players), med to-pass for
 * splittet-cup-dagens avledede matcher og full rollback ved feil.
 *
 * Speiler den manuelle per-match-stien (`createGameInternal` med `intent=cup`):
 * hver match blir en `games`-rad med status `'scheduled'`, `tournament_id`-FK og
 * `tournament_match_label`, pluss `game_players` med `team_number` 1/2 og
 * `accepted_at` satt. `course_handicap` settes IKKE her — det fryses når runden
 * faktisk startes, akkurat som for enkelt-opprettede cup-matcher. Kolonner med
 * DB-default (require_peer_approval, registration_*, side_*) utelates bevisst og
 * arves fra schema-default — `score_visibility` likeså for ORDINÆRE matcher.
 *
 * To-pass insert (#1441, D3/D4): en bunt-match uten `sourceId` (greensome/
 * best-ball-host) MÅ eksistere i DB før en avledet singles-match kan peke på
 * den via `source_game_id`. De tre eldre presetene — og kaptein-uttaket, som
 * alltid lager hele matcher — har ingen avledede matcher og går uendret gjennom
 * kun host-passet.
 */
export async function insertCupMatches(
  ctx: InsertCupMatchesContext,
  matches: CupBatchMatch[],
): Promise<InsertCupMatchesResult> {
  const {
    client,
    tournamentId,
    cupName,
    groupId,
    courseId,
    teeBoxId,
    teeRatings,
    allowances,
    scheduledTeeOffAt,
    createdBy,
  } = ctx;

  // #1441 (D3): to-pass — host-matcher (uten `sourceId`) må finnes i DB før
  // avledede matcher kan peke på dem via `source_game_id`. En `sourceId` som
  // ikke matcher en `id` blant HOST-matchene i DENNE planen er en manipulert
  // payload → avvis før noe insertes (ingen batch å rulle tilbake).
  if (!hasValidSourceMatches(matches)) {
    return { error: 'invalid_source_match' };
  }
  const hostMatches = matches.filter((m) => !m.sourceId);
  const derivedMatches = matches.filter((m) => m.sourceId);

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
    console.error('[cup] insertCupMatches profile read failed', {
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

  // Løkka er ikke-atomisk: hver match er en egen games- + game_players-insert.
  // Feiler én av dem midtveis, er tidligere matchers rader allerede committet.
  // Samle alle innsatte game-id-er og rull hele batchen tilbake ved feil, ellers
  // blir en halvbygd cup liggende som eier ikke kan rydde (#675; samme symptom
  // som #641). game_players ryddes av FK `on delete cascade` (0001) når
  // games-raden slettes. #1441: samler id-er fra BEGGE pass — en host slettet
  // her CASCADE-er allerede sine avledede (0151), men vi samler alle likevel og
  // sletter alle via samme `.in(...)`; det andre delete-forsøket på en
  // allerede-CASCADE-fjernet rad er en harmløs 0-rows-affected no-op.
  const insertedGameIds: string[] = [];
  const rollbackBatch = async () => {
    if (insertedGameIds.length > 0) {
      await client.from('games').delete().in('id', insertedGameIds);
    }
  };

  /**
   * Insetter ÉN match (games-rad + game_players-rader). `sourceGameId` er kun
   * satt for pass 2 (avledede matcher, #1441 D3). Feil returneres som
   * `{ error }` i stedet for å kaste — kalleren avgjør rollback selv.
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
            team1: greensomeAutoTeamStrokes(
              match.side1,
              profileById,
              teeRatings,
            ),
            team2: greensomeAutoTeamStrokes(
              match.side2,
              profileById,
              teeRatings,
            ),
          }
        : undefined;
    const { data: game, error: gameErr } = await client
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
        hcp_allowance_pct: cupMatchAllowance(match.format, allowances)
          .hcpAllowancePct,
        created_by: createdBy,
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
        scheduled_tee_off_at: resolveScheduledTeeOffAt(
          scheduledTeeOffAt,
          match.flightIndex,
        ),
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
    const { error: gpErr } = await client
      .from('game_players')
      .insert(playerRows);
    if (gpErr) {
      return { error: 'insert_failed' };
    }

    return { gameId };
  }

  // Pass 1: host-matcher (uten `sourceId`). Må fullføre før pass 2, som mapper
  // plan-lokal id → innsatt game-id via `planIdToGameId`.
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

  return { gameIds: insertedGameIds };
}
