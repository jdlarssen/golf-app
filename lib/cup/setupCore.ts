import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireGameCache, expireTournamentCache } from '@/lib/games/expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { exceedsPersonalPlayerCap } from '@/lib/cup/limits';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  planCupPlanPropagation,
  type CupPlanValues as CupPlanPropagationValues,
  type StoredCupMatch,
} from './cupPlanPropagation';
import { getCupCandidatePlayers } from './getCupCandidatePlayers';
import type { CupDraftValues } from './parseCupDraftForm';
import type { CupPlanValues } from './planValidation';

/**
 * Oppsettet av en cup, delt av nettets handlinger og appens ruter (#2752). Kjernene
 * leser ingen cookie og redirecter aldri: kalleren har gjort gaten og sier hvem som
 * handler. `tournament_plans` og `tournament_participants` har ingen write-RLS
 * (0155), så de skrives med `admin`, og gaten er alt som stopper (AGENTS.md felle 3).
 */

/** Samme tagger og stier for nettet og appen. */
export function revalidateCupSetup(id: string, groupId: string | null): void {
  expireTournamentCache(id);
  revalidatePath(`/admin/cup/${id}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${id}`);
}

export type CreateDraftResult = { ok: true; id: string } | { ok: false; error: 'cup_insert_failed' };

/**
 * Selve skrivingen av et utkast. `writer` er kallerens egen klient: RLS er backstop
 * (0089 klubb-admin, 0090 skaper). `points_to_win` utelates med vilje: et utkast vet
 * ikke hvor mange matcher det får ennå, og `startTournament` utleder målet.
 */
export async function createTournamentDraftCore(
  writer: SupabaseClient<Database>,
  args: { userId: string; groupId: string | null; values: CupDraftValues },
): Promise<CreateDraftResult> {
  const { userId, groupId, values } = args;
  const { data, error } = await writer
    .from('tournaments')
    .insert({
      name: values.name,
      team_1_name: values.team1,
      team_2_name: values.team2,
      fourball_allowance_pct: values.fourballAllowance,
      foursomes_allowance_pct: values.foursomesAllowance,
      greensome_allowance_pct: values.greensomeAllowance,
      chapman_allowance_pct: values.chapmanAllowance,
      gruesome_allowance_pct: values.gruesomeAllowance,
      created_by: userId,
      group_id: groupId,
      // #1441 (D8): utelates når feltet var tomt, så DB-default 1/0,5 (migrasjon
      // 0153) gjelder, bit for bit dagens oppførsel for ordinære cuper.
      ...(values.winPoints !== undefined ? { win_points: values.winPoints } : {}),
      ...(values.tiePoints !== undefined ? { tie_points: values.tiePoints } : {}),
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[cup] createTournamentDraft failed', { error });
    return { ok: false, error: 'cup_insert_failed' };
  }
  return { ok: true, id: data.id };
}

/**
 * Skriver den nettopp lagrede planen ned på cupens ALLEREDE genererte matcher
 * (#1523). Uten dette var plan→match-kopien en engangs-hendelse ved
 * generering: endret arrangøren starttiden etterpå, ble matchene stående uten
 * tee-off, og hverken cron-sveipet eller E1-fallbacken hadde noe å fyre på.
 *
 * Hvilke rader som treffes og hvilken tid hver av dem får avgjøres av den rene
 * `planCupPlanPropagation` (som gjenskaper genereringens egen utregning) —
 * her gjøres kun I/O.
 *
 * To vern på skrivingen:
 *  - `.eq('status', 'scheduled')` gjentar status-filteret i selve UPDATE-en.
 *    Rekker cron-sveipet å starte en match mellom lesingen og skrivingen, skal
 *    den startede runden IKKE få nye verdier — invarianten er hardere enn
 *    rad-tellingen.
 *  - `expectAffected`: fant lesingen scheduled-matcher, er 0 oppdaterte rader
 *    en ekte feil (felle #2), ikke en ærlig no-op. Ingen genererte matcher =
 *    ingen UPDATE i det hele tatt.
 *
 * Én UPDATE per distinkt starttid (splittet cup-dag forskyver flightene ti
 * minutter hver) — bane og tee er like for alle. Hver oppdatert kamp får
 * cache-tagen sin revalidert her: kampene leses gjennom
 * `getGameWithPlayers`-cachen (tag `game-${id}`), så uten dette ville
 * hull-siden og kamp-hjemmet vist gammel bane og starttid.
 *
 * `false` ut betyr at planen ER lagret, men matchene ikke fikk verdiene —
 * kalleren sier fra om nettopp det. En cup uten genererte matcher er `true`
 * (ærlig no-op).
 */
async function propagatePlanToScheduledMatches(
  admin: SupabaseClient<Database>,
  tournamentId: string,
  plan: CupPlanPropagationValues,
): Promise<boolean> {
  try {
    return await writePlanToScheduledMatches(admin, tournamentId, plan);
  } catch (err) {
    console.error('[cup] saveCupPlan match propagation failed', {
      tournamentId,
      err,
    });
    return false;
  }
}

/** Selve lesingen og skrivingen — feil kastes til wrapperen over. */
async function writePlanToScheduledMatches(
  admin: SupabaseClient<Database>,
  tournamentId: string,
  plan: CupPlanPropagationValues,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('games')
    .select('id, status, source_game_id, tournament_match_label, hole_segment')
    .eq('tournament_id', tournamentId);
  if (error) throw new Error(`propagatePlanToScheduledMatches: ${error.message}`);

  const matches: StoredCupMatch[] = (rows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    sourceGameId: r.source_game_id,
    matchLabel: r.tournament_match_label,
    holeSegment: r.hole_segment,
  }));

  const updates = planCupPlanPropagation(matches, plan);
  if (updates.length === 0) return true;

  const byTeeOff = new Map<string | null, string[]>();
  for (const u of updates) {
    const ids = byTeeOff.get(u.scheduledTeeOffAt) ?? [];
    ids.push(u.gameId);
    byTeeOff.set(u.scheduledTeeOffAt, ids);
  }

  const updatedIds: string[] = [];
  for (const [scheduledTeeOffAt, ids] of byTeeOff) {
    const affected = expectAffected(
      await admin
        .from('games')
        .update({
          course_id: plan.courseId,
          tee_box_id: plan.teeBoxId,
          scheduled_tee_off_at: scheduledTeeOffAt,
        })
        .in('id', ids)
        .eq('status', 'scheduled')
        .select('id'),
      'saveCupPlan.propagateToMatches',
    );
    updatedIds.push(...affected.map((row) => row.id));
  }

  for (const gameId of updatedIds) expireGameCache(gameId);
  return true;
}

export type SaveCupPlanError =
  | 'not_found'
  | 'not_draft'
  | 'plan_course'
  | 'plan_tee'
  | 'plan_save_failed'
  | 'plan_matches_not_updated';

/**
 * Lagrer planen, bare mens cupen er utkast. Bane må finnes, og tee må tilhøre banen
 * og ikke være arkivert. `plan_matches_not_updated` betyr at planen ER lagret, men at
 * matchene ikke fikk verdiene, og skrivingen er idempotent (#1523).
 */
export async function saveCupPlanCore(
  admin: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    courseId: string;
    teeBoxId: string;
    scheduledTeeOffAt: string | null;
    values: CupPlanValues;
  },
): Promise<{ ok: true } | { ok: false; error: SaveCupPlanError }> {
  const { tournamentId: id, courseId, teeBoxId, scheduledTeeOffAt, values } = args;

  const { data: cup } = await admin.from('tournaments').select('status').eq('id', id).maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };
  if (cup.status !== 'draft') return { ok: false, error: 'not_draft' };

  const { data: course } = await admin.from('courses').select('id').eq('id', courseId).maybeSingle();
  if (!course) return { ok: false, error: 'plan_course' };

  const { data: tee } = await admin
    .from('tee_boxes')
    .select('id, course_id, archived_at')
    .eq('id', teeBoxId)
    .maybeSingle();
  if (!tee || tee.course_id !== courseId || tee.archived_at !== null) {
    return { ok: false, error: 'plan_tee' };
  }

  // Upsert på `tournament_id` (unique): én plan per cup i v1. `updated_at` settes
  // eksplisitt (ingen ON UPDATE-trigger på tabellen). En 0-rads-upsert her er en ekte
  // feil (felle #2), ikke en ærlig no-op.
  try {
    expectAffected(
      await admin
        .from('tournament_plans')
        .upsert(
          {
            tournament_id: id,
            course_id: courseId,
            tee_box_id: teeBoxId,
            scheduled_tee_off_at: scheduledTeeOffAt,
            preset_id: values.presetId,
            custom_sessions: values.customSessions,
            strategy: values.strategy,
            best_ball_allowance_pct: values.bestBallAllowancePct,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tournament_id' },
        )
        .select('tournament_id'),
      'saveCupPlan',
    );
  } catch (err) {
    console.error('[cup] saveCupPlan upsert failed', { id, err });
    return { ok: false, error: 'plan_save_failed' };
  }

  const propagated = await propagatePlanToScheduledMatches(admin, id, {
    courseId,
    teeBoxId,
    scheduledTeeOffAt,
  });
  return propagated ? { ok: true } : { ok: false, error: 'plan_matches_not_updated' };
}

export type AddParticipantError =
  | 'not_found'
  | 'not_draft'
  | 'not_candidate'
  | 'too_many_players'
  | 'plan_save_failed';

/**
 * Legg til én deltaker. Brukeren MÅ være en gyldig, ikke-pending kandidat for cupen:
 * klient-lister er ikke authz (AGENTS.md felle 3), og kilden følger kallerens rolle,
 * som generer-veiviseren. Personlig cup hos en vanlig bruker har deltaker-taket
 * (#526). Duplikat er en stille no-op.
 */
export async function addCupParticipantCore(
  admin: SupabaseClient<Database>,
  caller: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    targetUserId: string;
    actor: { userId: string; isAdmin: boolean };
    groupId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: AddParticipantError }> {
  const { tournamentId: id, targetUserId, actor, groupId } = args;
  const { userId, isAdmin } = actor;

  const { data: cup } = await admin.from('tournaments').select('status').eq('id', id).maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };
  if (cup.status !== 'draft') return { ok: false, error: 'not_draft' };

  const candidates = await getCupCandidatePlayers(caller, {
    groupId,
    userId,
    isAdmin,
    // Kun `id`/`pending` leses under, så labelen når ingen skjerm.
    unknownLabel: 'Ukjent spiller',
  });
  const candidate = candidates.find((c) => c.id === targetUserId);
  if (!candidate || candidate.pending) return { ok: false, error: 'not_candidate' };

  // Teller distinkt sett etter tillegg. En allerede påmeldt gjør settet uendret.
  if (!groupId && !isAdmin) {
    const { data: existing, error: existingErr } = await admin
      .from('tournament_participants')
      .select('user_id')
      .eq('tournament_id', id);
    // #1810: vakta feiler LUKKET. Kan vi ikke telle, sier vi nei. En vellykket
    // lesing med 0 rader er derimot en gyldig tom cup.
    if (existingErr) {
      console.error('[cup] addCupParticipant cap read failed', { id, targetUserId, error: existingErr });
      return { ok: false, error: 'plan_save_failed' };
    }
    const distinctAfter = new Set([...(existing ?? []).map((r) => r.user_id as string), targetUserId]).size;
    if (exceedsPersonalPlayerCap(distinctAfter, isAdmin)) return { ok: false, error: 'too_many_players' };
  }

  const { error: insertErr } = await admin
    .from('tournament_participants')
    .upsert(
      { tournament_id: id, user_id: targetUserId },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[cup] addCupParticipant failed', { id, targetUserId, error: insertErr });
    return { ok: false, error: 'plan_save_failed' };
  }
  return { ok: true };
}

export type RemoveParticipantError = 'not_found' | 'not_draft' | 'plan_save_failed';

/**
 * Fjern én deltaker. Rører ALDRI allerede genererte matcher: fjerning påvirker kun
 * fremtidig fordeling. En delete som treffer 0 rader er en ærlig no-op (raden er
 * alt borte), i motsetning til upsert-stien over (felle #2).
 */
export async function removeCupParticipantCore(
  admin: SupabaseClient<Database>,
  args: { tournamentId: string; targetUserId: string },
): Promise<{ ok: true } | { ok: false; error: RemoveParticipantError }> {
  const { tournamentId: id, targetUserId } = args;

  const { data: cup } = await admin.from('tournaments').select('status').eq('id', id).maybeSingle();
  if (!cup) return { ok: false, error: 'not_found' };
  if (cup.status !== 'draft') return { ok: false, error: 'not_draft' };

  const { error: deleteErr } = await admin
    .from('tournament_participants')
    .delete()
    .eq('tournament_id', id)
    .eq('user_id', targetUserId);
  if (deleteErr) {
    console.error('[cup] removeCupParticipant failed', { id, targetUserId, error: deleteErr });
    return { ok: false, error: 'plan_save_failed' };
  }
  return { ok: true };
}
