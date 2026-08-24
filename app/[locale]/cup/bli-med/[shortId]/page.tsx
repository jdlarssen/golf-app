import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffLineLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { getCupJoinContext } from '@/lib/cup/getCupJoinContext';
import { evaluateCupJoin } from '@/lib/cup/joinValidation';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';
import { CupJoinActions } from './CupJoinActions';

type Params = Promise<{ shortId: string }>;
type SearchParams = Promise<{ status?: string | string[] }>;

/**
 * Bekreftelsene actionene redirecter med. `*_self`-variantene er skaperens egen
 * påmelding: samme handling, men uten «vi sa fra til arrangøren» — det varselet
 * sendes aldri til deg selv (`actions.ts`, `actorIsCreator`).
 */
const STATUS_CODES = ['joined', 'left', 'joined_self', 'left_self'] as const;

/**
 * `/cup/bli-med/[shortId]` — spillerens ene dør inn i en cup (#1490, #344
 * «one door per room»). Arrangøren deler lenken fra Spillere-rommet; lenken ER
 * gaten (eierbeslutning 2026-08-07: ingen godkjenningsrunde).
 *
 * Hvilken tilstand som rendres avgjøres av `evaluateCupJoin` — nøyaktig samme
 * funksjon som server-actionen håndhever, så knappen kan aldri vises på et
 * grunnlag skrivingen ikke godtar.
 *
 * Cup-oppslaget går via admin-client: en ikke-medlem kan ikke se en klubb-cup
 * gjennom RLS (0089), og da ville lenken gitt 404 i stedet for «for medlemmer
 * av X» — som er hele poenget med den tilstanden.
 */
export default async function CupBliMedPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { shortId } = await params;
  const sp = await searchParams;
  const statusCode = first(sp.status);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = (await getLocale()) as AppLocale;
  const selfHref = `/cup/bli-med/${shortId}`;

  if (!user) redirect({ href: `/login?next=${selfHref}`, locale });

  const [{ cup, facts }, t] = await Promise.all([
    getCupJoinContext(shortId, user!.id),
    getTranslations('cup.join'),
  ]);

  if (!cup) notFound();

  const decision = evaluateCupJoin(facts);
  const admin = getAdminClient();

  // Klubb-navn + klubbens egen bli-med-lenke hentes kun når vi faktisk skal
  // sende spilleren dit (medlems-tilstanden). Bane/starttid kun når det finnes
  // en påmeldingsvei å pynte på.
  let club: { name: string; short_id: string } | null = null;
  if (decision === 'not_member' && cup!.group_id) {
    const { data } = await admin
      .from('groups')
      .select('name, short_id')
      .eq('id', cup!.group_id)
      .maybeSingle<{ name: string; short_id: string }>();
    club = data ?? null;
  }

  let planLine: string | null = null;
  if (decision === 'can_join' || decision === 'already_joined') {
    const { data: plan } = await admin
      .from('tournament_plans')
      .select(
        'scheduled_tee_off_at, courses:courses!tournament_plans_course_id_fkey(name)',
      )
      .eq('tournament_id', cup!.id)
      .maybeSingle<{
        scheduled_tee_off_at: string | null;
        courses: { name: string } | { name: string }[] | null;
      }>();
    if (plan) {
      const rel = plan.courses;
      const courseName = (Array.isArray(rel) ? rel[0] : rel)?.name ?? null;
      const teeOff = plan.scheduled_tee_off_at
        ? formatTeeOffLineLocale(plan.scheduled_tee_off_at, locale)
        : null;
      planLine = [courseName, teeOff].filter(Boolean).join(' · ') || null;
    }
  }

  const status = STATUS_CODES.find((code) => code === statusCode);
  const statusBanner = status ? t(`statusMessages.${status}`) : null;

  // Lenken til cup-siden er bare en vei videre for den som slipper inn der:
  // `canViewCupPage` (lib/cup/cupPageAccess.ts) gir 404 på en klubb-cup til en
  // som hverken er medlem eller deltaker. Uten denne sjekken ble den stengte
  // tilstanden en blindvei. (Global admin kommer også inn, men det vet ikke
  // join-konteksten — da mangler knappen heller enn å lyve.)
  const canOpenCupPage =
    !cup!.group_id || facts.isClubMember || facts.alreadyJoined;

  return (
    <AppShell>
      <TopBar backHref="/" kicker={t('kicker')} />
      <PageHeader
        title={cup!.name}
        subtitle={t('teams', {
          team1: cup!.team_1_name,
          team2: cup!.team_2_name,
        })}
      />

      {statusBanner && (
        <div className="mb-6">
          <Banner tone="success" testId="cup-join-status">
            {statusBanner}
          </Banner>
        </div>
      )}

      <Card>
        <div data-testid={`cup-join-state-${decision}`} className="space-y-4">
          {decision === 'can_join' && (
            <>
              {planLine && (
                <p className="font-sans text-sm text-muted tabular-nums">
                  {planLine}
                </p>
              )}
              <p className="font-sans text-[15px] text-text">{t('invite')}</p>
              <CupJoinActions shortId={shortId} mode="join" />
            </>
          )}

          {decision === 'already_joined' && (
            <>
              <p className="font-sans text-[15px] text-text">
                {t('alreadyJoined')}
              </p>
              {planLine && (
                <p className="font-sans text-sm text-muted tabular-nums">
                  {planLine}
                </p>
              )}
              <CupJoinActions shortId={shortId} mode="leave" />
              <LinkButton href={`/cup/${cup!.id}`} variant="ghost" full>
                {t('goToCupButton')}
              </LinkButton>
            </>
          )}

          {decision === 'closed' && (
            <>
              <p className="font-sans text-[15px] text-text">{t('closed')}</p>
              {canOpenCupPage && (
                <LinkButton href={`/cup/${cup!.id}`} variant="secondary" full>
                  {t('goToCupButton')}
                </LinkButton>
              )}
            </>
          )}

          {decision === 'full' && (
            <p className="font-sans text-[15px] text-text">
              {t('full', { cap: MAX_PERSONAL_CUP_PLAYERS })}
            </p>
          )}

          {decision === 'not_member' && (
            <>
              <p className="font-sans text-[15px] text-text">
                {t('notMember', { club: club?.name ?? t('theClubFallback') })}
              </p>
              {club && (
                <LinkButton
                  href={`/klubber/bli-med/${club.short_id}`}
                  variant="secondary"
                  full
                >
                  {t('joinClubButton')}
                </LinkButton>
              )}
            </>
          )}

          {decision === 'profile_incomplete' && (
            <>
              <p className="font-sans text-[15px] text-text">
                {t('profileIncomplete')}
              </p>
              <SmartLink
                href={`/complete-profile?next=${encodeURIComponent(selfHref)}`}
                className="block rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-white min-h-[44px] flex items-center justify-center dark:text-bg"
              >
                {t('completeProfileButton')}
              </SmartLink>
            </>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
