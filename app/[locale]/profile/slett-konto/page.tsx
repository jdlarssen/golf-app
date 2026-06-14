import { first } from '@/lib/url/searchParams';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { SmartLink } from '@/components/ui/SmartLink';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { deleteOwnAccount } from './actions';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{ error?: string | string[] }>;

export default async function SlettKontoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile.deleteAccount');
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const supabase = await getServerClient();
  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode && t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : errorCode ? t('errors.delete_failed') : undefined;

  // Check if the user is in any active/scheduled game
  const { data: activeGames } = await supabase
    .from('game_players')
    .select('game_id, games!inner(status, name)')
    .eq('user_id', userId)
    .in('games.status', ['active', 'scheduled']);

  const isBlocked = (activeGames ?? []).length > 0;

  // Get the user's name for display
  const { data: userProfile } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();

  const displayName = userProfile?.name?.trim() || userProfile?.email || 'kontoen din';

  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {isBlocked ? (
        <div className="space-y-4">
          <Banner tone="error">
            {t('blockedBanner')}
          </Banner>
          <SmartLink
            href="/profile"
            className="block rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text"
          >
            {t('blockedBackLink')}
          </SmartLink>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface px-4 py-4 space-y-3">
            <h2 className="font-serif text-base font-medium text-text">
              {t('deletedHeading')}
            </h2>
            <ul className="space-y-1.5 text-sm text-text">
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>{t('bullet1')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>{t('bullet2')}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>{t('bullet3')}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface px-4 py-4 space-y-3">
            <h2 className="font-serif text-base font-medium text-text">
              {t('keptHeading')}
            </h2>
            <ul className="space-y-1.5 text-sm text-text">
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>{t('keptBullet')}</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-danger-deep/30 bg-danger-deep/10 dark:bg-danger-deep/20 px-4 py-4 space-y-3">
            <p className="font-sans text-sm text-text leading-relaxed">
              {t.rich('confirmParagraph', {
                displayName,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <form action={deleteOwnAccount}>
              <SubmitButton
                className="w-full"
                style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
                pendingLabel={t('deletePending')}
              >
                {t('deleteButton')}
              </SubmitButton>
            </form>
            <SmartLink
              href="/profile"
              className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text"
            >
              {t('cancelButton')}
            </SmartLink>
          </div>
        </div>
      )}
    </AppShell>
  );
}
