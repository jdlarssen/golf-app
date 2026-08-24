import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';

type CupDoorData = {
  courseName: string | null;
  teeName: string | null;
  participantCount: number;
};

/**
 * Dør-status-data (#1472): bane/tee-navn fra lagret plan + antall påmeldte.
 * Kun kalt mens cupen er `draft` (dørene vises bare da). Trukket ut av
 * `CupManagement` for å holde komponentens cyclomatic complexity nede — leser
 * fra request-klienten (SELECT-policy tillater authenticated, 0154-mønsteret).
 */
async function fetchCupDoorData(tournamentId: string): Promise<CupDoorData> {
  const supabase = await getServerClient();
  const [{ data: plan }, participantsResult] = await Promise.all([
    supabase
      .from('tournament_plans')
      .select('course_id, tee_box_id')
      .eq('tournament_id', tournamentId)
      .maybeSingle(),
    supabase
      .from('tournament_participants')
      .select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId),
  ]);

  let courseName: string | null = null;
  let teeName: string | null = null;
  if (plan?.course_id && plan?.tee_box_id) {
    const [{ data: course }, { data: tee }] = await Promise.all([
      supabase.from('courses').select('name').eq('id', plan.course_id).maybeSingle(),
      supabase.from('tee_boxes').select('name').eq('id', plan.tee_box_id).maybeSingle(),
    ]);
    courseName = course?.name ?? null;
    teeName = tee?.name ?? null;
  }

  return {
    courseName,
    teeName,
    participantCount: participantsResult.count ?? 0,
  };
}

/**
 * Én dør fra cup-detaljsiden til et rom (#1472). Hele kortet er lenken
 * (≥44px tap-target); tittel + status-subtitle + chevron-affordance.
 */
function CupDoor({
  href,
  testId,
  title,
  subtitle,
}: {
  href: string;
  testId: string;
  title: string;
  subtitle: string;
}) {
  return (
    <SmartLink
      href={href}
      data-testid={testId}
      className="block rounded-2xl"
    >
      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base text-text">{title}</p>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0 text-muted"
        >
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </svg>
      </Card>
    </SmartLink>
  );
}

/**
 * #1472: tre dører — Oppsett, Spillere, Fordel & generer. Vises kun i draft;
 * empty-states håndteres inne i rommene, så dørene er alltid klikkbare.
 * Dør-status-data hentes kun mens cupen er draft (dørene vises bare da).
 * Trukket ut av `CupManagement` for å holde komponentens cyclomatic complexity
 * nede.
 */
export async function CupDoorsSection({
  tournamentId,
  isDraft,
  isClub,
  groupId,
  matchCount,
}: {
  tournamentId: string;
  isDraft: boolean;
  isClub: boolean;
  groupId: string | null;
  matchCount: number;
}) {
  const doorData = isDraft ? await fetchCupDoorData(tournamentId) : null;
  if (!isDraft || !doorData) return null;

  const t = await getTranslations('cup');

  // Rom-lenker (#1472) deler samme admin/klubb-form. Alle rommene (oppsett,
  // spillere, generer) henger under samme cup.
  const roomHref = (room: string) =>
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}/${room}`
      : `/admin/cup/${tournamentId}/${room}`;

  const oppsettSubtitle =
    doorData.courseName && doorData.teeName
      ? t('manage.doors.oppsettSubtitle', {
          course: doorData.courseName,
          tee: doorData.teeName,
        })
      : t('manage.doors.oppsettEmpty');

  return (
    <section className="mb-5 space-y-3">
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        {t('manage.doors.heading')}
      </h2>
      <CupDoor
        href={roomHref('oppsett')}
        testId="cup-door-oppsett"
        title={t('manage.doors.oppsettTitle')}
        subtitle={oppsettSubtitle}
      />
      <CupDoor
        href={roomHref('spillere')}
        testId="cup-door-spillere"
        title={t('manage.doors.spillereTitle')}
        subtitle={t('manage.doors.spillereSubtitle', {
          count: doorData.participantCount,
        })}
      />
      <CupDoor
        href={roomHref('generer')}
        testId="cup-door-generer"
        title={t('manage.doors.genererTitle')}
        subtitle={t('manage.doors.genererSubtitle', {
          count: matchCount,
        })}
      />
    </section>
  );
}
