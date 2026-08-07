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
  type CupSessionFormat,
} from '@/lib/cup/cupTemplates';
import { type PairingStrategy } from '@/lib/cup/cupPairing';
import { type WizardPlayer } from '@/lib/cup/getCupCandidatePlayers';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';

// WizardPlayer bor i lib/cup/getCupCandidatePlayers (#1472). Re-eksportert her
// så eksisterende importører av `./GenerateMatches` (GenerateMatchesWizard +
// dens test) er uendret.
export type { WizardPlayer };

// #1441 (F3c): rating-feltene under (slope/course_rating/par_total × mens/
// ladies/juniors) er kun brukt av splittet-cup-dag-bunten, for å vise hver
// spillers spillehandicap som regnehjelp ved greensomens manuelle lag-slag
// (D10). Optional i WizardTeeBox (ikke required) — de tre eldre presetene
// bryr seg ikke, og eksisterende test-fixtures bygger `{id, name}` uten dem.
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

// FK-joins typer Supabase JS som array selv på many-to-one — normaliser.
type ParticipantUser = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  gender: 'mens' | 'ladies' | null;
};

function userOf(
  rel: ParticipantUser | ParticipantUser[] | null | undefined,
): ParticipantUser | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function displayNameOf(u: ParticipantUser | null): string {
  return u?.nickname?.trim() || u?.name?.trim() || 'Ukjent spiller';
}

const SESSION_FORMAT_IDS = new Set<string>([
  'foursomes_matchplay',
  'fourball_matchplay',
  'singles_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
]);

/** Trygg normalisering av `custom_sessions` (jsonb) → CupSessionFormat[]. */
function normalizeCustomSessions(raw: unknown): CupSessionFormat[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is CupSessionFormat =>
      typeof v === 'string' && SESSION_FORMAT_IDS.has(v),
  );
}

type GenerateMatchesVariant = 'admin' | 'club';

/**
 * Delt Fordel-og-generer-flate (#524/#1472, Rom 3). Begge ruter
 * (`/admin/cup/[id]/generer` og `/klubber/[id]/cup/[cupId]/generer`) rendrer
 * denne. Gaten gjøres i ruten; komponenten gjør all fetching + chrome.
 *
 * #1472: bane/tee/tee-off/format/strategi kommer nå fra den LAGREDE planen
 * (Oppsett-rommet), og rosteren er cupens PÅMELDTE deltakere (Spillere-rommet)
 * — ikke lenger kandidat-kilden. Mangler forutsetningene, viser rommet en
 * guided empty-state (#752) med lenke til det rommet som mangler noe, i stedet
 * for veiviseren.
 */
export async function GenerateMatches({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: GenerateMatchesVariant;
}) {
  const supabase = await getServerClient();
  const { isAdmin } = await getRoleContext(supabase);

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

  const admin = getAdminClient();

  // Lagret plan (SELECT-policy tillater authenticated — request-klient holder)
  // + påmeldte deltakere (admin-client så klubb-admins ser hele lista uansett
  // users-RLS, samme som Spillere-rommet).
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
    const u = userOf(row.users as ParticipantUser | ParticipantUser[] | null);
    return {
      id: row.user_id,
      displayName: displayNameOf(u),
      hcpIndex: Number(u?.hcp_index ?? 0),
      gender: u?.gender ?? null,
    };
  });

  // Resolve planens bane + tee (navn til recap + rating-sett til greensomens
  // regnehjelp). En arkivert tee (eller en slettet bane/tee) resolver IKKE →
  // planen regnes som ufullstendig og guider tilbake til Oppsett-rommet, i tråd
  // med at genereringen ville avvist en arkivert tee server-side (`plan_tee`).
  let planCourseName = '';
  let planTeeName = '';
  let selectedTee: WizardTeeBox | undefined;
  if (plan?.course_id && plan?.tee_box_id) {
    const { data: course } = await supabase
      .from('courses')
      .select(
        'id, name, tee_boxes(id, name, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
      )
      .eq('id', plan.course_id)
      .maybeSingle<CourseRow>();
    if (course) {
      const tee = (course.tee_boxes ?? []).find(
        (tb) => tb.id === plan.tee_box_id && tb.archived_at === null,
      );
      if (tee) {
        planCourseName = course.name;
        planTeeName = tee.name;
        selectedTee = {
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
        };
      }
    }
  }
  // planReady krever at planen finnes, har bane+tee, OG at de faktisk resolver.
  const planReady = selectedTee !== undefined;

  let clubName: string | null = null;
  if (groupId) {
    const { data: club } = await admin
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const cupBase =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const backHref = cupBase;
  const kicker = variant === 'club' ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker =
    variant === 'club'
      ? t('generate.brassRibbonClub', { name: tournament.name })
      : t('generate.brassRibbonAdmin', { name: tournament.name });

  // #526: personlig cup av en vanlig bruker er capped; admin og klubb-cup er
  // uncapped. Speiler cap-håndhevingen i createCupMatchesFromPlan.
  const matchCap =
    !groupId && !isAdmin ? MAX_PERSONAL_CUP_MATCHES : undefined;

  const hasParticipants = participants.length > 0;

  // #752: guided empty-state — vis forklaring + lenke til det rommet som mangler
  // noe (Oppsett / Spillere) i stedet for veiviseren. Kan stables (begge
  // mangler på en fersk cup).
  if (!planReady || !hasParticipants) {
    return (
      <Shell>
        <TopBar backHref={backHref} kicker={kicker} />
        <BrassRibbon kicker={ribbonKicker} />
        <PageHeader
          title={t('generate.pageTitle')}
          subtitle={`${tournament.team_1_name} ${t('generate.mot')} ${tournament.team_2_name}`}
        />
        <div className="space-y-3">
          {!planReady && (
            <Card>
              <p className="text-sm text-muted mb-2">
                {t('generate.emptyStateNoPlan')}
              </p>
              <SmartLink
                href={`${cupBase}/oppsett`}
                className="text-sm text-text underline hover:no-underline"
              >
                {t('generate.emptyStateNoPlanLink')}
              </SmartLink>
            </Card>
          )}
          {!hasParticipants && (
            <Card>
              <p className="text-sm text-muted mb-2">
                {t('generate.emptyStateNoParticipants')}
              </p>
              <SmartLink
                href={`${cupBase}/spillere`}
                className="text-sm text-text underline hover:no-underline"
              >
                {t('generate.emptyStateNoParticipantsLink')}
              </SmartLink>
            </Card>
          )}
        </div>
      </Shell>
    );
  }

  const presetId = plan?.preset_id ?? 'klassisk';
  const customSessions = normalizeCustomSessions(plan?.custom_sessions);
  const strategy: PairingStrategy =
    plan?.strategy === 'random' ? 'random' : 'handicap';

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
        players={participants}
        matchCap={matchCap}
        planCourseName={planCourseName}
        planTeeName={planTeeName}
        selectedTee={selectedTee}
        presetId={presetId}
        customSessions={customSessions}
        strategy={strategy}
      />
    </Shell>
  );
}
