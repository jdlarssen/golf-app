import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { connectFriend } from './actions';
import type { AppLocale } from '@/i18n/routing';

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

type Owner = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
};

function ownerName(o: Owner): string {
  const base = o.name?.trim() || o.email;
  return o.nickname ? `${base} «${o.nickname}»` : base;
}

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
  const locale = (await getLocale()) as AppLocale;
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
    return;
  }

  const admin = getAdminClient();
  const { data: owner } = await admin
    .from('users')
    .select('id, name, nickname, email')
    .eq('friend_code', code)
    // #1012: anonymiserte kontoer kan ikke legges til som venn.
    .is('deleted_at', null)
    .maybeSingle<Owner>();

  if (!owner) notFound();

  const isSelf = owner.id === user.id;
  const friendIds = isSelf ? [] : await getFriendIds(user.id);
  const alreadyFriends = friendIds.includes(owner.id);

  return (
    <AppShell>
      <TopBar backHref="/profile/venner" backLabel={t('backLabel')} kicker={t('kicker')} />
      <PageHeader title={ownerName(owner)} />

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
              {tf('leggTil.connectCard', { name: ownerName(owner) })}
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
