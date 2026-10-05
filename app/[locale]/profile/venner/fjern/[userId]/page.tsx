import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { displayNameForOthers } from '@/lib/users/displayName';
import { isUuid } from '@/lib/url/isUuid';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { LinkButton } from '@/components/ui/Button';
import { removeFriend } from '../../actions';

type Params = Promise<{ userId: string }>;

const VENNER = '/profile/venner';

/**
 * /profile/venner/fjern/[userId] (#2267): «Fjerne Marte som venn?» before a
 * friend is removed. A friend row on the friends page leads here; removing is
 * destructive, so it gets its own page (repo rule: never an inline toggle).
 *
 * Someone who is not your friend sends you back before the name is read, so a
 * stranger's id never reveals a name. The name is read with the admin client
 * (the users-RLS gap, as `getFriendData`) and leaves the server only as
 * `displayNameForOthers` gives it: the name, else the masked address.
 */
export default async function FjernVennPage({ params }: { params: Params }) {
  const { userId: friendId } = await params;
  const locale = await getLocale();

  const me = await getProxyVerifiedUserId();
  if (!me) {
    redirect({ href: `/login?next=${VENNER}/fjern/${friendId}`, locale });
  }
  if (!isUuid(friendId)) notFound();

  const friendIds = await getFriendIds(me);
  if (!friendIds.includes(friendId)) {
    redirect({ href: VENNER, locale });
  }

  const t = await getTranslations('friends');
  const { data, error } = await getAdminClient()
    .from('users')
    .select('name, nickname, email')
    .eq('id', friendId)
    .maybeSingle<{ name: string | null; nickname: string | null; email: string | null }>();
  if (error) console.error('[venner/fjern] name lookup failed', error);
  const name = (data && displayNameForOthers(data)) || t('someoneFallback');

  return (
    <AppShell>
      <TopBar backHref={VENNER} backLabel={t('leggTil.backLabel')} kicker={t('kicker')} />

      <div className="space-y-6">
        <div className="px-1">
          <h1 className="mb-2 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
            {t('removeHeading', { name })}
          </h1>
          <p className="font-sans text-[13px] leading-relaxed text-muted">
            {t('removeBody', { name })}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <form action={removeFriend}>
            <input type="hidden" name="other_id" value={friendId} />
            <SubmitButton
              variant="danger"
              className="w-full"
              pendingLabel={t('removePending')}
              data-testid="friend-remove-confirm"
            >
              {t('removeAsFriendLabel')}
            </SubmitButton>
          </form>
          <LinkButton href={VENNER} variant="secondary" full data-testid="friend-remove-cancel">
            {t('cancelLabel')}
          </LinkButton>
        </div>
      </div>
    </AppShell>
  );
}
