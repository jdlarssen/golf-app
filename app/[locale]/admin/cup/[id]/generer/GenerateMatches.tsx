import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getRoleContext } from '@/lib/admin/auth';
import { MAX_PERSONAL_CUP_MATCHES } from '@/lib/cup/limits';
import {
  getCupCandidatePlayers,
  type WizardPlayer,
} from '@/lib/cup/getCupCandidatePlayers';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';

// WizardPlayer bor nå i lib/cup/getCupCandidatePlayers (#1472 — delt med
// Spillere-rommet). Re-eksportert her så eksisterende importører av
// `./GenerateMatches` (GenerateMatchesWizard + dens test) er uendret.
export type { WizardPlayer };

// #1441 (F3c): rating-feltene under (slope/course_rating/par_total × mens/
// ladies/juniors) er kun brukt av splittet-cup-dag-bunten, for å vise hver
// spillers spillehandicap som regnehjelp ved greensomens manuelle lag-slag
// (D10). Optional i WizardTeeBox (ikke required) — de tre eldre presetene
// bryr seg ikke, og eksisterende test-fixtures (GenerateMatchesWizard.test)
// bygger `{id, name}` uten dem.
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

export type WizardTeeBox = {
  id: string;
  name: string;
  slope_mens?: number | null;
  course_rating_mens?: number | null;
  par_total_mens?: number | null;
  slope_ladies?: number | null;
  course_rating_ladies?: number | null;
  par_total_ladies?: number | null;
  slope_juniors?: number | null;
  course_rating_juniors?: number | null;
  par_total_juniors?: number | null;
};

export type WizardCourse = {
  id: string;
  name: string;
  teeBoxes: WizardTeeBox[];
};

type GenerateMatchesVariant = 'admin' | 'club';

/**
 * Delt match-genererings-flate (#524). Begge ruter (`/admin/cup/[id]/generer`
 * og `/klubber/[id]/cup/[cupId]/generer`) rendrer denne. Gaten gjøres i ruten;
 * komponenten gjør all fetching + chrome.
 *
 * Spiller-kilden følger cupens kontekst (#524/#526/#464):
 *  - klubb-cup (group_id satt) → KUN klubbens medlemmer.
 *  - personlig cup, global admin → alle profil-fullførte brukere (sekretariat).
 *  - personlig cup, vanlig skaper → skaperens venner + skaperen selv (samme
 *    venne-scoping som opprett-veiviseren, ikke hele brukerbasen).
 */
export async function GenerateMatches({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: GenerateMatchesVariant;
}) {
  const supabase = await getServerClient();
  const { userId, isAdmin } = await getRoleContext(supabase);

  const [snapshot, t, locale] = await Promise.all([
    getCupSnapshot(tournamentId),
    getTranslations('cup'),
    getLocale(),
  ]);
  if (!snapshot) notFound();

  const { tournament } = snapshot;
  const groupId = tournament.group_id;

  // Bare generering mens cupen er utkast.
  if (tournament.status !== 'draft') {
    redirect({
      href:
        variant === 'club' && groupId
          ? `/klubber/${groupId}/cup/${tournamentId}`
          : `/admin/cup/${tournamentId}`,
      locale,
    });
  }

  const coursesResult = await supabase
    .from('courses')
    .select(
      'id, name, tee_boxes(id, name, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .order('name', { ascending: true })
    .returns<CourseRow[]>();
  if (coursesResult.error) throw coursesResult.error;

  const courses: WizardCourse[] = (coursesResult.data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      teeBoxes: (c.tee_boxes ?? [])
        .filter((t) => t.archived_at === null)
        .map((t) => ({
          id: t.id,
          name: t.name,
          slope_mens: t.slope_mens,
          course_rating_mens: t.course_rating_mens,
          par_total_mens: t.par_total_mens,
          slope_ladies: t.slope_ladies,
          course_rating_ladies: t.course_rating_ladies,
          par_total_ladies: t.par_total_ladies,
          slope_juniors: t.slope_juniors,
          course_rating_juniors: t.course_rating_juniors,
          par_total_juniors: t.par_total_juniors,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'no')),
    }))
    .filter((c) => c.teeBoxes.length > 0);

  // Spiller-kilde følger cupens kontekst (#1472: nå delt med Spillere-rommet
  // via lib/cup/getCupCandidatePlayers). Kilden følger HVEM som ser lista
  // (klubb-medlemmer / alle profil-fullførte / skaperens venner+selv).
  const players: WizardPlayer[] = await getCupCandidatePlayers(supabase, {
    groupId,
    userId,
    isAdmin,
  });

  let clubName: string | null = null;
  if (groupId) {
    const { data: club } = await getAdminClient()
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const backHref =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const kicker = variant === 'club' ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker =
    variant === 'club'
      ? t('generate.brassRibbonClub', { name: tournament.name })
      : t('generate.brassRibbonAdmin', { name: tournament.name });

  // #526: personlig cup av en vanlig bruker er capped; admin og klubb-cup er
  // uncapped. Speiler cap-håndhevingen i createCupMatchesFromPlan.
  const matchCap =
    !groupId && !isAdmin ? MAX_PERSONAL_CUP_MATCHES : undefined;

  // #752: guided empty-state — vis forklaring + lenke i stedet for veiviseren
  // når det mangler spillere eller baner (inkl. «alle tees arkivert»-tilfellet
  // som allerede er filtrert ut av courses-mappingen over).
  const hasPlayers = players.length > 0;
  const hasCourses = courses.length > 0;

  if (!hasPlayers || !hasCourses) {
    const playerHref =
      groupId
        ? `/klubber/${groupId}`
        : `/admin/spillere`;
    return (
      <Shell>
        <TopBar backHref={backHref} kicker={kicker} />
        <BrassRibbon kicker={ribbonKicker} />
        <PageHeader
          title={t('generate.pageTitle')}
          subtitle={`${tournament.team_1_name} ${t('generate.mot')} ${tournament.team_2_name}`}
        />
        <div className="space-y-3">
          {!hasPlayers && (
            <Card>
              <p className="text-sm text-muted mb-2">
                {t('generate.emptyStatePlayers')}
              </p>
              <SmartLink
                href={playerHref}
                className="text-sm text-text underline hover:no-underline"
              >
                {t('generate.emptyStatePlayersLink')}
              </SmartLink>
            </Card>
          )}
          {!hasCourses && (
            <Card>
              <p className="text-sm text-muted mb-2">
                {t('generate.emptyStateCourses')}
              </p>
              <SmartLink
                href="/admin/courses/new"
                className="text-sm text-text underline hover:no-underline"
              >
                {t('generate.emptyStateCoursesLink')}
              </SmartLink>
            </Card>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title={t('generate.pageTitle')}
        subtitle={`${tournament.team_1_name} ${t('generate.mot')} ${tournament.team_2_name}`}
      />
      <GenerateMatchesWizard
        tournamentId={tournamentId}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
        players={players}
        courses={courses}
        matchCap={matchCap}
      />
    </Shell>
  );
}
