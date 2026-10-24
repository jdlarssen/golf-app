import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { friendLinkView } from '@/lib/friends/friendLinkView';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { connectFriend } from './actions';

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /venner/legg-til/[code] — «legg til meg»-lenkens landingsside (#369).
 *
 * Tilstander:
 *   - Ikke innlogget → redirect til /login?next=...
 *   - Ukjent kode → 404
 *   - Egen lenke → «Dette er din egen lenke»
 *   - Allerede venner → bekreftelse + lenke til vennelista
 *   - Ellers → «Bli venn med [navn]» + koble-knapp
 */
export default async function LeggTilPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const locale = await getLocale();
  const t = await getTranslations('friends.leggTil');
  const tf = await getTranslations('friends');

  const { code } = await params;
  const { error } = await searchParams;
  const hasError = (Array.isArray(error) ? error[0] : error) === '1';

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: `/login?next=/venner/legg-til/${code}`, locale });
  }

  // #2627: the same lookup as the app's `GET /api/friends/link/[code]`. The
  // name is masked on the server (#2271): everyone with the link sees it.
  const view = await friendLinkView(user.id, code);
  if (!view) notFound();

  const isSelf = view.relation === 'self';
  const alreadyFriends = view.relation === 'already_friends';

  return (
    <AppShell>
      <TopBar backHref="/profile/venner" backLabel={t('backLabel')} kicker={t('kicker')} />
      <PageHeader title={view.name} />

      {hasError && (
        <div className="mb-4">
          <Banner tone="error">{t('errorBanner')}</Banner>
        </div>
      )}

      <Card>
        {isSelf ? (
          <p className="font-sans text-[15px] text-text">
            {t('selfCard')}
          </p>
        ) : alreadyFriends ? (
          <>
            <p className="mb-4 font-sans text-[15px] text-text">
              {t('alreadyFriendsCard')}
            </p>
            <SmartLink
              href="/profile/venner"
              className="flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-bg"
            >
              {t('toFriendsLink')}
            </SmartLink>
          </>
        ) : (
          <>
            <p className="mb-4 font-sans text-[15px] text-text">
              {tf('leggTil.connectCard', { name: view.name })}
            </p>
            <form action={connectFriend}>
              <input type="hidden" name="code" value={code} />
              <SubmitButton className="w-full" pendingLabel={t('connectPending')}>
                {t('connectButton')}
              </SubmitButton>
            </form>
          </>
        )}
      </Card>
    </AppShell>
  );
}
