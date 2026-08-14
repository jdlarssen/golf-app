'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import type { Database } from '@/lib/database.types';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { exceedsPersonalPlayerCap } from '@/lib/cup/limits';
import { parseOsloDateTimeLocal, isTeeOffInPast } from '@/lib/games/gamePayload';
import {
  planCupPlanPropagation,
  type CupPlanValues,
  type StoredCupMatch,
} from './cupPlanPropagation';
import { parseCupPlanForm } from './planValidation';
import { getCupCandidatePlayers } from './getCupCandidatePlayers';

/**
 * Server-actions for de to første cup-rommene (#1472): Oppsett (plan) og
 * Spillere (deltakerliste). Egen fil (ikke `lib/cup/actions.ts`):
 * `tournament_plans` og `tournament_participants` har INGEN write-RLS-policies
 * (migrasjon 0155, samme mønster som 0154-sidepoengene) — all skriving går via
 * `getAdminClient()` (service-role), gatet KUN av `requireAdminOrClubAdminOfCup`
 * i denne fila. Det er et distinkt sikkerhetsmønster verdt å holde adskilt fra
 * request-klient-mønsteret resten av `actions.ts` bruker (der RLS er backstop).
 *
 * Feil returneres som `{ error: kode }` (#1397-mønsteret — en form-redirect
 * ville unmontert det utfylte skjemaet og slettet arrangørens input). Kun
 * suksess redirecter (kaster NEXT_REDIRECT). UI-chunken mapper kodene til norsk.
 */

// Samme `{ error }`-form som `CupActionError` i actions.ts. Bevisst løs `string`
// (ikke union-import) så cup-rommene og opprett-flyten forblir uavhengige.
export type CupPlanActionError = { error: string };

/**
 * Felles redirect-mål for et cup-rom. Klubb-cup (`groupId` satt) holder seg i
 * klubb-chrome; frittstående går til admin-cup. Speiler `cupRedirectBase` i
 * actions.ts, men lokalt (den er ikke eksportert derfra — å eksportere en
 * helper fra en `'use server'`-fil ville laget et unødvendig action-endepunkt).
 * `sub` er en valgfri under-sti (f.eks. '/spillere').
 */
function cupPath(id: string, groupId: string | null, sub = ''): string {
  return groupId ? `/klubber/${groupId}/cup/${id}${sub}` : `/admin/cup/${id}${sub}`;
}

function revalidateCup(id: string, groupId: string | null): void {
  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${id}`);
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
  plan: CupPlanValues,
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
  plan: CupPlanValues,
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

  for (const gameId of updatedIds) revalidateTag(`game-${gameId}`, 'max');
  return true;
}

/**
 * Rom 1 — Oppsett. Lagrer bane/tee/tee-off/preset/strategi/best-ball for cupen
 * i `tournament_plans` (upsert på `tournament_id` — én plan per cup i v1).
 *
 * Validering av DB-uavhengige felt (preset/strategi/sesjoner/best-ball) skjer
 * i `parseCupPlanForm` FØR DB-en røres (som `createTournamentDraft`). Bane/tee
 * verifiseres mot DB (tee må tilhøre bane og ikke være arkivert). Tee-off er
 * valgfri: tom → NULL; ellers parses Oslo-veggklokke → UTC og avvises i fortiden.
 */
export async function saveCupPlan(
  formData: FormData,
): Promise<CupPlanActionError> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { error: 'not_found' };

  const courseId = String(formData.get('course_id') ?? '').trim();
  const teeBoxId = String(formData.get('tee_box_id') ?? '').trim();
  const teeOffRaw = String(formData.get('tee_off_at') ?? '').trim();

  // DB-uavhengig validering først (ingen DB-tur på en avvist form).
  const parsed = parseCupPlanForm({
    presetId: String(formData.get('preset_id') ?? ''),
    strategy: String(formData.get('strategy') ?? ''),
    customSessionsRaw: String(formData.get('custom_sessions') ?? ''),
    bestBallAllowanceRaw: String(formData.get('best_ball_allowance_pct') ?? ''),
  });
  if ('error' in parsed) return { error: parsed.error };

  if (!courseId) return { error: 'plan_course' };
  if (!teeBoxId) return { error: 'plan_tee' };

  // Tee-off: valgfri. Tom → NULL. Ellers Oslo-veggklokke → UTC ISO, ikke fortid.
  let scheduledTeeOffAt: string | null = null;
  if (teeOffRaw !== '') {
    try {
      scheduledTeeOffAt = parseOsloDateTimeLocal(teeOffRaw);
    } catch {
      return { error: 'plan_tee_off_invalid' };
    }
    if (isTeeOffInPast(scheduledTeeOffAt)) return { error: 'plan_tee_off_past' };
  }

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);

  const admin = getAdminClient();
  const { data: cup } = await admin
    .from('tournaments')
    .select('status, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!cup) return { error: 'not_found' };
  if (cup.status !== 'draft') return { error: 'not_draft' };
  const groupId = (cup.group_id as string | null) ?? null;

  // Bane må finnes; tee må tilhøre banen og ikke være arkivert.
  const { data: course } = await admin
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .maybeSingle();
  if (!course) return { error: 'plan_course' };

  const { data: tee } = await admin
    .from('tee_boxes')
    .select('id, course_id, archived_at')
    .eq('id', teeBoxId)
    .maybeSingle();
  if (!tee || tee.course_id !== courseId || tee.archived_at !== null) {
    return { error: 'plan_tee' };
  }

  // Upsert på `tournament_id` (unique) — én plan per cup i v1. `updated_at`
  // settes eksplisitt (ingen ON UPDATE-trigger på tabellen). `.select()` +
  // `expectAffected`: en 0-rads-upsert her er en ekte feil (felle #2), ikke
  // en ærlig no-op.
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
            preset_id: parsed.ok.presetId,
            custom_sessions: parsed.ok.customSessions,
            strategy: parsed.ok.strategy,
            best_ball_allowance_pct: parsed.ok.bestBallAllowancePct,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tournament_id' },
        )
        .select('tournament_id'),
      'saveCupPlan',
    );
  } catch (err) {
    console.error('[cup] saveCupPlan upsert failed', { id, err });
    return { error: 'plan_save_failed' };
  }

  // #1523: planen er lagret — nå ned på matchene som allerede er generert.
  // Egen feilkode: planen ER lagret på dette punktet, så `plan_save_failed`
  // ville løyet. Arrangøren får vite at matchene ikke fikk de nye verdiene og
  // kan lagre på nytt (skrivingen er idempotent).
  const propagated = await propagatePlanToScheduledMatches(admin, id, {
    courseId,
    teeBoxId,
    scheduledTeeOffAt,
  });
  revalidateCup(id, groupId);
  if (!propagated) return { error: 'plan_matches_not_updated' };

  redirect(`${cupPath(id, groupId)}?status=plan_saved`);
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}

/**
 * Rom 2 — Spillere: legg til én deltaker. Server-side re-validering av at
 * brukeren ER en gyldig (ikke-pending) kandidat for cupen — klient-lister er
 * ikke authz (AGENTS.md-felle #3). Personlig ikke-admin-cup håndhever
 * `exceedsPersonalPlayerCap` (regelens ene hjem, #526) på deltaker-settet
 * etter tillegg. Duplikat = stille no-op (upsert, ignoreDuplicates).
 */
export async function addCupParticipant(
  formData: FormData,
): Promise<CupPlanActionError> {
  const id = String(formData.get('id') ?? '').trim();
  const targetUserId = String(formData.get('user_id') ?? '').trim();
  if (!id) return { error: 'not_found' };
  if (!targetUserId) return { error: 'not_candidate' };

  const supabase = await getServerClient();
  const { userId, isAdmin } = await requireAdminOrClubAdminOfCup(supabase, id);

  const admin = getAdminClient();
  const { data: cup } = await admin
    .from('tournaments')
    .select('status, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!cup) return { error: 'not_found' };
  if (cup.status !== 'draft') return { error: 'not_draft' };
  const groupId = (cup.group_id as string | null) ?? null;

  // Eligibility: brukeren MÅ være en gyldig, ikke-pending kandidat for cupen.
  // Kilden følger kallerens rolle (samme som generer-veiviseren ser).
  const candidates = await getCupCandidatePlayers(supabase, {
    groupId,
    userId,
    isAdmin,
    // Kun `id`/`pending` leses under — `displayName` rendres aldri herfra, så
    // labelen når ingen skjerm. Konstant framfor en getTranslations-runde.
    unknownLabel: 'Ukjent spiller',
  });
  const candidate = candidates.find((c) => c.id === targetUserId);
  if (!candidate || candidate.pending) return { error: 'not_candidate' };

  // Personlig ikke-admin: håndhev deltaker-taket (#526). Teller distinkt sett
  // etter tillegg — mirror av genereringens cap-sjekk. Et allerede påmeldt
  // targetUserId gjør settet uendret (ingen falsk avvisning ved re-add).
  if (!groupId && !isAdmin) {
    const { data: existing } = await admin
      .from('tournament_participants')
      .select('user_id')
      .eq('tournament_id', id);
    const distinctAfter = new Set([
      ...(existing ?? []).map((r) => r.user_id as string),
      targetUserId,
    ]).size;
    if (exceedsPersonalPlayerCap(distinctAfter, isAdmin)) {
      return { error: 'too_many_players' };
    }
  }

  // Upsert med ignoreDuplicates: allerede påmeldt = stille no-op (ikke en feil).
  const { error: insertErr } = await admin
    .from('tournament_participants')
    .upsert(
      { tournament_id: id, user_id: targetUserId },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[cup] addCupParticipant failed', { id, targetUserId, error: insertErr });
    return { error: 'plan_save_failed' };
  }

  revalidateCup(id, groupId);
  redirect(`${cupPath(id, groupId, '/spillere')}?status=participant_added`);
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}

/**
 * Rom 2 — Spillere: fjern én deltaker. Rører ALDRI allerede genererte matcher
 * (de bor i games/game_players) — fjerning påvirker kun fremtidig fordeling.
 */
export async function removeCupParticipant(
  formData: FormData,
): Promise<CupPlanActionError> {
  const id = String(formData.get('id') ?? '').trim();
  const targetUserId = String(formData.get('user_id') ?? '').trim();
  if (!id) return { error: 'not_found' };
  if (!targetUserId) return { error: 'not_found' };

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);

  const admin = getAdminClient();
  const { data: cup } = await admin
    .from('tournaments')
    .select('status, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!cup) return { error: 'not_found' };
  if (cup.status !== 'draft') return { error: 'not_draft' };
  const groupId = (cup.group_id as string | null) ?? null;

  // Bevisst INGEN expectAffected her: en delete som treffer 0 rader er en ærlig
  // no-op (raden er allerede borte — arrangøren ville ha deltakeren fjernet, og
  // det er hun). I motsetning til upsert-stien over, der 0 rader ville vært en
  // reell feil (felle #2).
  const { error: deleteErr } = await admin
    .from('tournament_participants')
    .delete()
    .eq('tournament_id', id)
    .eq('user_id', targetUserId);
  if (deleteErr) {
    console.error('[cup] removeCupParticipant failed', { id, targetUserId, error: deleteErr });
    return { error: 'plan_save_failed' };
  }

  revalidateCup(id, groupId);
  redirect(`${cupPath(id, groupId, '/spillere')}?status=participant_removed`);
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}
