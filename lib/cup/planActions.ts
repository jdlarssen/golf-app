'use server';

import { redirect } from '@/lib/nav/redirect';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { parseOsloDateTimeLocal, isTeeOffInPast } from '@/lib/games/gamePayload';
import { parseCupPlanForm } from './planValidation';
import {
  addCupParticipantCore,
  removeCupParticipantCore,
  revalidateCupSetup,
  saveCupPlanCore,
} from './setupCore';

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
  if (!parsed.ok) return { error: parsed.error };

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
  // `groupId` kommer fra gaten (#1749): den har allerede lest kolonnen med
  // admin-klienten.
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, id);

  const result = await saveCupPlanCore(getAdminClient(), {
    tournamentId: id,
    courseId,
    teeBoxId,
    scheduledTeeOffAt,
    values: parsed.values,
  });
  // Egen feilkode når planen ER lagret, men matchene ikke fikk verdiene: cachene
  // må da busted uansett.
  if (result.ok || result.error === 'plan_matches_not_updated') revalidateCupSetup(id, groupId);
  if (!result.ok) return { error: result.error };

  redirect(`${cupPath(id, groupId)}?status=plan_saved`);
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
  // `groupId` kommer fra gaten (#1749), se saveCupPlan.
  const { userId, isAdmin, groupId } = await requireAdminOrClubAdminOfCup(supabase, id);

  const result = await addCupParticipantCore(getAdminClient(), supabase, {
    tournamentId: id,
    targetUserId,
    actor: { userId, isAdmin },
    groupId,
  });
  if (!result.ok) return { error: result.error };

  revalidateCupSetup(id, groupId);
  redirect(`${cupPath(id, groupId, '/spillere')}?status=participant_added`);
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
  // `groupId` kommer fra gaten (#1749), se saveCupPlan.
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, id);

  const result = await removeCupParticipantCore(getAdminClient(), { tournamentId: id, targetUserId });
  if (!result.ok) return { error: result.error };

  revalidateCupSetup(id, groupId);
  redirect(`${cupPath(id, groupId, '/spillere')}?status=participant_removed`);
}

/**
 * Form handler for the remove-confirm page (#2244). `<form action>` needs a
 * `Promise<void>`, while `removeCupParticipant` keeps this file's `{ error }`
 * contract (same precedent as `withdrawalFormActions.ts`). Success redirects
 * inside the action; a returned code sends the organiser back to the same
 * confirm page with `?error=`, so the banner shows where they stand instead of
 * a silent no-op. The door comes from the gate's `groupId`, never from the form.
 */
export async function submitRemoveCupParticipant(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const targetUserId = String(formData.get('user_id') ?? '').trim();
  // Only a hand-built post lacks these; there is no door to go back to.
  if (!id || !targetUserId) redirect('/');

  const result = await removeCupParticipant(formData);

  // Reached only with a returned code, after the action's gate let the caller
  // through; re-reading the door through the same gate keeps it server-side.
  const supabase = await getServerClient();
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, id);
  const confirmPath = cupPath(
    id,
    groupId,
    `/spillere/fjern/${encodeURIComponent(targetUserId)}`,
  );
  redirect(`${confirmPath}?error=${encodeURIComponent(result.error || 'plan_save_failed')}`);
}
