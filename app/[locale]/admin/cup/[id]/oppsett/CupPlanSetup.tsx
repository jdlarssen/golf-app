import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { formatOsloDateTimeLocal } from '@/lib/games/gamePayload';
import { normalizeCustomSessions } from '@/lib/cup/planValidation';
import { CupPlanForm } from './CupPlanForm';

type CupRoomVariant = 'admin' | 'club';

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: { id: string; name: string; archived_at: string | null }[];
};

type PlanRow = {
  course_id: string | null;
  tee_box_id: string | null;
  scheduled_tee_off_at: string | null;
  preset_id: string | null;
  custom_sessions: unknown;
  strategy: string | null;
  best_ball_allowance_pct: number | null;
};

/** Bygger prefill-verdiene til formen fra en (kanskje manglende) plan-rad. */
function buildInitialValues(plan: PlanRow | null) {
  const presetId = plan?.preset_id ?? 'klassisk';
  return {
    courseId: plan?.course_id ?? '',
    teeBoxId: plan?.tee_box_id ?? '',
    teeOffLocal: plan?.scheduled_tee_off_at
      ? formatOsloDateTimeLocal(plan.scheduled_tee_off_at)
      : '',
    presetId,
    customSessions:
      presetId === 'tilpasset'
        ? normalizeCustomSessions(plan?.custom_sessions)
        : [],
    strategy: (plan?.strategy === 'random' ? 'random' : 'handicap') as
      | 'handicap'
      | 'random',
    bestBallAllowancePct: plan?.best_ball_allowance_pct ?? 85,
  };
}

/**
 * Delt Oppsett-flate (#1472, Rom 1). Begge ruter (`/admin/cup/[id]/oppsett` og
 * `/klubber/[id]/cup/[cupId]/oppsett`) rendrer denne. Gaten gjøres i ruten;
 * komponenten henter snapshot + bane/tee + lagret plan og rendrer formen.
 *
 * Kun redigerbar mens cupen er `draft` — ellers redirect til cup-detalj (samme
 * mønster som `GenerateMatches`).
 */
export async function CupPlanSetup({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: CupRoomVariant;
}) {
  const supabase = await getServerClient();

  // Oversettelsene først: navne-fallbacken (#1527) er input til snapshot-en.
  const [t, locale] = await Promise.all([getTranslations('cup'), getLocale()]);

  const snapshot = await getCupSnapshot(tournamentId, t('manage.unknownPlayer'));
  if (!snapshot) notFound();

  const { tournament } = snapshot;
  const groupId = tournament.group_id;

  if (tournament.status !== 'draft') {
    redirect({
      href:
        variant === 'club' && groupId
          ? `/klubber/${groupId}/cup/${tournamentId}`
          : `/admin/cup/${tournamentId}`,
      locale,
    });
  }

  // Bane + tee — arkiverte teer filtreres bort; baner uten aktive teer droppes.
  const coursesResult = await supabase
    .from('courses')
    .select('id, name, tee_boxes(id, name, archived_at)')
    .order('name', { ascending: true })
    .returns<CourseRow[]>();
  if (coursesResult.error) throw coursesResult.error;

  const courses = (coursesResult.data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      teeBoxes: (c.tee_boxes ?? [])
        .filter((tb) => tb.archived_at === null)
        .map((tb) => ({ id: tb.id, name: tb.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'no')),
    }))
    .filter((c) => c.teeBoxes.length > 0);

  // Lagret plan (SELECT-policy tillater authenticated — request-klient holder).
  const { data: plan } = await supabase
    .from('tournament_plans')
    .select(
      'course_id, tee_box_id, scheduled_tee_off_at, preset_id, custom_sessions, strategy, best_ball_allowance_pct',
    )
    .eq('tournament_id', tournamentId)
    .maybeSingle();

  let clubName: string | null = null;
  if (variant === 'club' && groupId) {
    const { data: club } = await getAdminClient()
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const initial = buildInitialValues(plan);

  // #1523: matchene som ennå ikke er startet får planens bane/tee/starttid når
  // arrangøren lagrer. Tallet er nøyaktig de radene `saveCupPlan` oppdaterer —
  // startede og ferdige matcher røres aldri, og telles derfor ikke med.
  const scheduledMatchCount = snapshot.leaderboard.matches.filter(
    (m) => m.status === 'scheduled',
  ).length;

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const backHref =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const kicker =
    variant === 'club' ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker =
    variant === 'club'
      ? t('plan.brassRibbonClub', { name: tournament.name })
      : t('plan.brassRibbonAdmin', { name: tournament.name });

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title={t('plan.pageTitle')}
        subtitle={t('plan.subtitle', {
          team1: tournament.team_1_name,
          team2: tournament.team_2_name,
        })}
      />
      <CupPlanForm
        tournamentId={tournamentId}
        courses={courses}
        initial={initial}
        scheduledMatchCount={scheduledMatchCount}
      />
    </Shell>
  );
}
