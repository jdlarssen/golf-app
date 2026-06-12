import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { getFriendData, type FriendUser } from '@/lib/friends/getFriendData';
import { sendFriendInvite } from '../../invite/actions';
import {
  sendFriendRequest,
  addFriendByEmail,
  respondFriendRequest,
  removeFriend,
} from './actions';
import { SubmitButton } from '@/components/ui/SubmitButton';
import {
  AddByEmailForm,
  ConfirmSubmit,
  CopyLinkButton,
} from './VennerClient';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{
  status?: string | string[];
  invite_email?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function personName(u: FriendUser): string {
  const base = u.name?.trim() || u.email;
  return u.nickname ? `${base} «${u.nickname}»` : base;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 font-serif text-base font-medium text-text">
      {children}
    </h2>
  );
}

function PersonLine({ name }: { name: string }) {
  return (
    <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-text">
      {name}
    </span>
  );
}

export default async function VennerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('friends');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login?next=/profile/venner', locale });
    return;
  }

  const sp = await searchParams;
  const statusCode = first(sp.status);
  const inviteEmail = first(sp.invite_email);

  const TONE: Record<string, 'success' | 'error' | 'info'> = {
    requested: 'success',
    accepted: 'success',
    already_friends: 'info',
    already_pending: 'info',
    declined: 'info',
    removed: 'info',
    self: 'error',
    email_required: 'error',
    error: 'error',
  };

  type StatusKey =
    | 'requested'
    | 'accepted'
    | 'already_friends'
    | 'already_pending'
    | 'declined'
    | 'removed'
    | 'self'
    | 'email_required'
    | 'error';

  const statusBanner =
    statusCode && statusCode in TONE
      ? {
          tone: TONE[statusCode] as 'success' | 'error' | 'info',
          text: t(`status.${statusCode as StatusKey}`),
        }
      : undefined;

  const supabase = await getServerClient();
  const [{ friends, incoming, outgoing, suggestions }, codeRes] = await Promise.all([
    getFriendData(userId),
    supabase.from('users').select('friend_code').eq('id', userId).maybeSingle<{
      friend_code: string | null;
    }>(),
  ]);
  const friendCode = codeRes.data?.friend_code ?? null;

  return (
    <AppShell>
      <TopBar backHref="/profile" backLabel={t('backLabel')} kicker={t('kicker')} />
      <PageHeader
        title={t('kicker')}
        subtitle={t('subtitle')}
      />

      {statusBanner && (
        <div className="mb-4">
          <Banner tone={statusBanner.tone}>{statusBanner.text}</Banner>
        </div>
      )}

      {inviteEmail && (
        <div className="mb-4">
          <Card>
            <p className="mb-3 font-sans text-[15px] text-text">
              {t('invitePrompt', { email: inviteEmail })}
            </p>
            <form action={sendFriendInvite} className="flex items-center gap-2">
              <input type="hidden" name="email" value={inviteEmail} />
              <SubmitButton pendingLabel={t('invitePending')}>
                {t('inviteButton', { email: inviteEmail })}
              </SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {/* Innkommende forespørsler */}
      {incoming.length > 0 && (
        <>
          <SectionTitle>{t('incomingSection')}</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {incoming.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(r.user)} />
                  <form action={respondFriendRequest} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="accept" value="0" />
                    <SubmitButton variant="ghost" pendingLabel={t('declinePending')}>
                      {t('declineLabel')}
                    </SubmitButton>
                  </form>
                  <form action={respondFriendRequest} className="shrink-0">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="accept" value="1" />
                    <SubmitButton pendingLabel={t('acceptPending')}>
                      {t('acceptLabel')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Vennene dine */}
      <SectionTitle>{t('friendsSection')}</SectionTitle>
      <Card>
        {friends.length === 0 ? (
          <p className="font-sans text-[14px] text-muted">
            {t('noFriendsYet')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <PersonLine name={personName(f)} />
                <ConfirmSubmit
                  action={removeFriend}
                  hiddenName="other_id"
                  hiddenValue={f.id}
                  idleLabel={t('removeIdleLabel')}
                  confirmLabel={t('removeConfirmLabel')}
                  cancelLabel={t('cancelLabel')}
                  pendingLabel={t('removePending')}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Utgående forespørsler */}
      {outgoing.length > 0 && (
        <>
          <SectionTitle>{t('outgoingSection')}</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {outgoing.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(r.user)} />
                  <form action={removeFriend} className="shrink-0">
                    <input type="hidden" name="other_id" value={r.user.id} />
                    <SubmitButton variant="ghost" pendingLabel={t('withdrawPending')}>
                      {t('withdrawLabel')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Forslag fra co-players */}
      {suggestions.length > 0 && (
        <>
          <SectionTitle>{t('suggestionsSection')}</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {suggestions.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(s)} />
                  <form action={sendFriendRequest} className="shrink-0">
                    <input type="hidden" name="addressee_id" value={s.id} />
                    <SubmitButton variant="secondary" pendingLabel={t('addEmailPending')}>
                      {t('addEmailButton')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Legg til på e-post */}
      <SectionTitle>{t('addByEmailSection')}</SectionTitle>
      <Card>
        <p className="mb-3 font-sans text-[14px] text-muted">
          {t('addByEmailSubtitle')}
        </p>
        <AddByEmailForm
          action={addFriendByEmail}
          label={t('addEmailLabel')}
          placeholder={t('addEmailPlaceholder')}
          pendingLabel={t('addEmailPending')}
          buttonLabel={t('addEmailButton')}
        />
      </Card>

      {/* Del lenke */}
      {friendCode && (
        <>
          <SectionTitle>{t('shareLinkSection')}</SectionTitle>
          <Card>
            <p className="mb-3 font-sans text-[14px] text-muted">
              {t('shareLinkSubtitle')}
            </p>
            <CopyLinkButton
              path={`/venner/legg-til/${friendCode}`}
              copyLabel={t('copyLinkLabel')}
              copiedLabel={t('copiedLabel')}
              promptFallback={t('copyPromptFallback')}
            />
          </Card>
        </>
      )}
    </AppShell>
  );
}
