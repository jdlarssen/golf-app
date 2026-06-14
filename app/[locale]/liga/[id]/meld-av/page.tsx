import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { leagueSelfServiceState } from '@/lib/league/selfService';
import type { LeagueStatus } from '@/lib/league/types';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { leaveClubLeague } from '@/lib/league/actions';
import type { AppLocale } from '@/i18n/routing';


type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /liga/[id]/meld-av — dedikert confirm-side for å melde seg av en klubb-liga
 * (#452 Fase 3). Destructive flyt → egen rute (repo-regel: aldri inline-toggle /
 * <details>), speiler /klubber/[id]/forlat.
 *
 * Gates til en bruker som faktisk kan melde seg av (deltaker, klubb-liga, ikke
 * spilt en runde, ikke avsluttet); ellers redirect tilbake til liga-siden.
 */
export default async function MeldAvLigaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const [t, locale] = await Promise.all([
    getTranslations('liga.player.meldAv'),
    getLocale() as Promise<AppLocale>,
  ]);

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=/liga/${id}/meld-av`, locale });

  const snapshot = await getLigaSnapshot(id);
  if (!snapshot) notFound();
  const { league, participants } = snapshot;

  const me = participants.find((p) => p.userId === user!.id);
  const { canLeave } = leagueSelfServiceState({
    groupId: league.group_id,
    status: league.status as LeagueStatus,
    isClubMember: false, // irrelevant for canLeave
    isParticipant: me !== undefined,
    hasPlayed: me?.hasPlayed ?? false,
  });
  if (!canLeave) redirect({ href: `/liga/${id}`, locale });

  const errorCode = first(sp.error);
  const errorMessage = errorCode
    ? (t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
        ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
        : undefined)
    : undefined;

  return (
    <AppShell>
      <TopBar backHref={`/liga/${id}`} kicker={league.name} />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="space-y-6">
        <div className="px-1">
          <h1 className="mb-2 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
            {t('heading', { name: league.name })}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={leaveClubLeague}>
            <input type="hidden" name="league_id" value={league.id} />
            <SubmitButton
              variant="danger"
              className="w-full"
              pendingLabel={t('confirmPending')}
            >
              {t('confirmButton')}
            </SubmitButton>
          </form>
          <SmartLink
            href={`/liga/${id}`}
            className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
          >
            {t('cancelButton')}
          </SmartLink>
        </div>
      </div>
    </AppShell>
  );
}
