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
import type { GameModeConfig } from '@/lib/scoring/modes/types';
import type { CupSessionFormat } from '@/lib/cup/cupTemplates';
import type { PlannedMatch } from '@/lib/cup/cupPairing';

/**
 * Batch-opprettelse av cup-matcher fra en generert plan (#219, fase 4).
 *
 * Speiler den manuelle per-match-stien (`createGameInternal` med `intent=cup`):
 * hver match blir en `games`-rad med status `'scheduled'`, `tournament_id`-FK og
 * `tournament_match_label`, pluss `game_players` med `team_number` 1/2 og
 * `status='active'`. `course_handicap` settes IKKE her — det fryses når runden
 * faktisk startes, akkurat som for enkelt-opprettede cup-matcher. Allowance per
 * format hentes fra cup-radens lagrede kolonner (samme verdier wizarden ville
 * pre-fylt). Kolonner med DB-default (require_peer_approval, score_visibility,
 * registration_*, side_*) utelates bevisst og arves fra schema-default.
 */

const MATCH_LABEL_MAX = 80;
const GAME_NAME_MAX = 120;
// Allowance defaults imported from @/lib/cup/allowance (ALLOWANCE_DEFAULTS) — #809.

/**
 * Bygger mode_config i samme form som de manuelt opprettede cup-matchene lagrer
 * (verifisert mot prod): singles = `{kind, team_size:1}`, 2v2-format =
 * `{kind, team_size:2, teams_count:2, allowance_pct}`.
 */
function cupMatchModeConfig(
  format: CupSessionFormat,
  fourballPct: number,
  foursomesPct: number,
  greensomePct: number,
  chapmanPct: number,
  gruesomePct: number,
): GameModeConfig {
  if (format === 'singles_matchplay') {
    return { kind: 'singles_matchplay', team_size: 1 } as GameModeConfig;
  }
  const allowance_pct =
    format === 'fourball_matchplay'
      ? fourballPct
      : format === 'foursomes_matchplay'
        ? foursomesPct
        : format === 'greensome_matchplay'
          ? greensomePct
          : format === 'chapman_matchplay'
            ? chapmanPct
            : gruesomePct; // gruesome_matchplay
  return {
    kind: format,
    team_size: 2,
    teams_count: 2,
    allowance_pct,
  } as GameModeConfig;
}

// teeGenderOf imported from @/lib/games/teeGender (#809).

export type CupBatchInput = {
  tournamentId: string;
  courseId: string;
  teeBoxId: string;
  matches: PlannedMatch[];
};

export type CupBatchError = { error: string };

/**
 * Returnerer `{ error }` ved validerings-/DB-feil. Ved suksess redirecter den
 * til cup-detalj-siden (kaster NEXT_REDIRECT — kall-siden navigerer videre).
 */
export async function createCupMatchesFromPlan(
  input: CupBatchInput,
): Promise<CupBatchError> {
  const { tournamentId, courseId, teeBoxId, matches } = input;

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
    // Personlig cup, ikke-admin: håndhev «1 helg»-tak (#526). Teller
    // eksisterende + nye, så semantikken «≤4 matcher / ≤24 deltakere i cupen»
    // holder selv ved re-generering. Match-taket er bindende i praksis. Admin
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
  // dekker oppretterens egne rader.
  const insertedGameIds: string[] = [];
  const rollbackBatch = async () => {
    if (insertedGameIds.length > 0) {
      await supabase.from('games').delete().in('id', insertedGameIds);
    }
  };

  for (const match of matches) {
    const name = `${cupName} – ${match.label}`.slice(0, GAME_NAME_MAX);
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        name,
        course_id: courseId,
        tee_box_id: teeBoxId,
        status: 'scheduled',
        game_mode: match.format,
        mode_config: cupMatchModeConfig(match.format, fourballPct, foursomesPct, greensomePct, chapmanPct, gruesomePct),
        created_by: userId,
        tournament_id: tournamentId,
        tournament_match_label: match.label.slice(0, MATCH_LABEL_MAX),
        // Klubb-cup: bind match-spillet til klubben (data-konsistens). Null for
        // frittstående. Kolonnen er nullable (0075).
        group_id: groupId,
      })
      .select('id')
      .single();
    if (gameErr || !game) {
      await rollbackBatch();
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
      await rollbackBatch();
      return { error: 'insert_failed' };
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
