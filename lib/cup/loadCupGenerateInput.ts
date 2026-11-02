import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { PairingStrategy } from './cupPairing';
import type { CupSessionFormat } from './cupTemplates';
import type { WizardPlayer } from './getCupCandidatePlayers';
import type { WizardTeeBox } from './matchPlan';
import { normalizeCustomSessions } from './planValidation';

// #1441 (F3c): rating-feltene under (slope/course_rating/par_total × mens/
// ladies/juniors) er kun brukt av splittet-cup-dag-bunten, for å vise hver
// spillers spillehandicap som regnehjelp ved greensomens manuelle lag-slag
// (D10).
type TeeBoxRow = {
  id: string;
  name: string;
  archived_at: string | null;
  slope_mens: number | null;
  course_rating_mens: number | null;
  par_total_mens: number | null;
  slope_ladies: number | null;
  course_rating_ladies: number | null;
  par_total_ladies: number | null;
  slope_juniors: number | null;
  course_rating_juniors: number | null;
  par_total_juniors: number | null;
};

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: TeeBoxRow[];
};

type ParticipantUser = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  gender: 'mens' | 'ladies' | null;
};

function displayNameOf(u: ParticipantUser | null, unknownLabel: string): string {
  return u?.nickname?.trim() || u?.name?.trim() || unknownLabel;
}

/**
 * Resolve planens bane + tee (#1488, K13). En arkivert tee (eller en slettet
 * bane/tee) resolver IKKE → `selectedTee` forblir undefined og planen regnes som
 * ufullstendig, i tråd med at genereringen ville avvist en arkivert tee
 * server-side (`plan_tee`).
 */
async function resolvePlanCourseTee(
  supabase: SupabaseClient<Database>,
  plan: { course_id: string | null; tee_box_id: string | null } | null | undefined,
): Promise<{
  planCourseName: string;
  planTeeName: string;
  selectedTee: WizardTeeBox | undefined;
}> {
  const empty = { planCourseName: '', planTeeName: '', selectedTee: undefined };
  if (!plan?.course_id || !plan?.tee_box_id) return empty;
  const { data: course } = await supabase
    .from('courses')
    .select(
      'id, name, tee_boxes(id, name, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .eq('id', plan.course_id)
    .maybeSingle<CourseRow>();
  if (!course) return empty;
  const tee = (course.tee_boxes ?? []).find(
    (tb) => tb.id === plan.tee_box_id && tb.archived_at === null,
  );
  if (!tee) return empty;
  return {
    planCourseName: course.name,
    planTeeName: tee.name,
    selectedTee: {
      id: tee.id,
      name: tee.name,
      slope_mens: tee.slope_mens,
      course_rating_mens: tee.course_rating_mens,
      par_total_mens: tee.par_total_mens,
      slope_ladies: tee.slope_ladies,
      course_rating_ladies: tee.course_rating_ladies,
      par_total_ladies: tee.par_total_ladies,
      slope_juniors: tee.slope_juniors,
      course_rating_juniors: tee.course_rating_juniors,
      par_total_juniors: tee.par_total_juniors,
    },
  };
}

export type CupGenerateInput = {
  participants: WizardPlayer[];
  planCourseName: string;
  planTeeName: string;
  /** Satt bare når planen har bane og tee, og de finnes ennå. */
  selectedTee: WizardTeeBox | undefined;
  presetId: string;
  customSessions: CupSessionFormat[];
  strategy: PairingStrategy;
};

/**
 * Det «Fordel & generer» bygger på (#1472, #2752), for nettets side og appens rute:
 * den lagrede planen og de påmeldte. `supabase` er kallerens klient (SELECT-policyen
 * på planen dekker authenticated). `admin` leser deltakerne, så klubb-admins ser hele
 * lista uansett users-RLS, samme som Spillere-rommet.
 */
export async function loadCupGenerateInput(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  tournamentId: string,
  unknownLabel: string,
): Promise<CupGenerateInput> {
  const [planRes, participantRes] = await Promise.all([
    supabase
      .from('tournament_plans')
      .select(
        'course_id, tee_box_id, scheduled_tee_off_at, preset_id, custom_sessions, strategy, best_ball_allowance_pct',
      )
      .eq('tournament_id', tournamentId)
      .maybeSingle(),
    admin
      .from('tournament_participants')
      .select(
        'user_id, created_at, users:users!tournament_participants_user_id_fkey(id, name, nickname, hcp_index, gender)',
      )
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true }),
  ]);
  if (participantRes.error) throw participantRes.error;
  const plan = planRes.data;

  // Deltakerne er alltid profil-fullførte ved add-time (Spillere-rommet gater
  // det), så ingen `pending`-rader her — kartlegg rett til WizardPlayer.
  const participants: WizardPlayer[] = (participantRes.data ?? []).map((row) => {
    const u = row.users;
    return {
      id: row.user_id,
      displayName: displayNameOf(u, unknownLabel),
      hcpIndex: Number(u?.hcp_index ?? 0),
      gender: u?.gender ?? null,
    };
  });

  const { planCourseName, planTeeName, selectedTee } = await resolvePlanCourseTee(supabase, plan);

  return {
    participants,
    planCourseName,
    planTeeName,
    selectedTee,
    presetId: plan?.preset_id ?? 'klassisk',
    customSessions: normalizeCustomSessions(plan?.custom_sessions),
    strategy: plan?.strategy === 'random' ? 'random' : 'handicap',
  };
}
