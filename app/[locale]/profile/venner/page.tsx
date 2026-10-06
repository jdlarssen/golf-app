import { first } from '@/lib/url/searchParams';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { SmartLink } from '@/components/ui/SmartLink';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getFriendsView, type Friend, type Person } from '@/lib/friends/getFriendsView';
import type { FriendStats } from '@/lib/friends/friendStats';
import { lastPlayedLabel } from '@/lib/friends/lastPlayedLabel';
import { nameInitials } from '@/lib/names/initials';
import { formatHcpDisplay } from '@/lib/handicap/signFormat';
import { sendFriendInvite } from '../../invite/actions';
import {
  sendFriendRequest,
  addFriendByEmail,
  respondFriendRequest,
  removeFriend,
} from './actions';
import { GetTheGangCard } from './VennerClient';

type SearchParams = Promise<{
  status?: string | string[];
  invite_email?: string | string[];
}>;

const STATUS_TONE: Record<string, 'success' | 'error' | 'info'> = {
  requested: 'success',
  invited: 'success',
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
  | 'invited'
  | 'accepted'
  | 'already_friends'
  | 'already_pending'
  | 'declined'
  | 'removed'
  | 'self'
  | 'email_required'
  | 'error';

/** Section kicker as the artboard spaces it: 18 px above, 8 px below. */
const SECTION_KICKER = 'px-5 pt-[18px] pb-2';

function Avatar({ initials, className }: { initials: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${className}`}
    >
      {initials}
    </span>
  );
}

function NameBlock({
  name,
  sub,
  nameClass = 'text-[15px]',
  className = 'min-w-0 grow',
}: {
  name: string;
  sub: string | null;
  nameClass?: string;
  className?: string;
}) {
  return (
    <span className={`block ${className}`}>
      <span className={`block font-semibold ${nameClass}`}>{name}</span>
      {sub && <span className="block text-[12px] text-muted">{sub}</span>}
    </span>
  );
}

/**
 * /profile/venner (#2267), built as the artboard «Forslag: få med gjengen»:
 * getting the gang in first, then requests, people you have played with,
 * your friends with the rounds you shared, and requests you sent. Each friend
 * row leads to the remove confirmation.
 */
export default async function VennerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('friends');
  const tProfile = await getTranslations('profile');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login?next=/profile/venner', locale });
  }

  // #2201: opening the friends page marks friend requests and accepted
  // requests read.
  after(() => markReadOnVisit({ userId, surface: 'friends' }));

  const sp = await searchParams;
  const statusCode = first(sp.status);
  const inviteEmail = first(sp.invite_email);

  const statusBanner =
    statusCode && statusCode in STATUS_TONE
      ? {
          tone: STATUS_TONE[statusCode],
          text:
            statusCode === 'invited' && inviteEmail
              ? t('status.invited', { email: inviteEmail })
              : t(`status.${statusCode as StatusKey}`),
        }
      : undefined;

  const supabase = await getServerClient();
  const [view, own] = await Promise.all([
    getFriendsView(userId),
    // Your own row: the name for your initials in the green card.
    supabase.from('users').select('name').eq('id', userId).maybeSingle<{ name: string | null }>(),
  ]);
  if (own.error) console.error('[venner] own name lookup failed', own.error);
  const { friends, incoming, outgoing, suggestions, friendCode } = view;

  const now = new Date();
  const lastPlayed = (iso: string) =>
    lastPlayedLabel(iso, now, locale, {
      today: t('lastPlayedToday'),
      yesterday: t('lastPlayedYesterday'),
      weekday: (weekday) => t('lastPlayedWeekday', { weekday }),
    });
  const rounds = (stats: FriendStats | null) =>
    stats && stats.roundsTogether > 0 ? t('roundsTogether', { count: stats.roundsTogether }) : null;
  const friendSubline = (f: Friend): string | null => {
    if (f.stats === null) return null;
    if (f.stats.roundsTogether === 0) return t('noRoundsYet');
    const parts: string[] = [];
    if (f.hcp !== null) parts.push(t('hcpLine', { hcp: formatHcpDisplay(f.hcp, locale) }));
    parts.push(t('roundsTogether', { count: f.stats.roundsTogether }));
    if (f.stats.lastPlayedAt) parts.push(lastPlayed(f.stats.lastPlayedAt));
    return parts.join(' · ');
  };
  const displayName = (p: Person) => p.name || t('someoneFallback');
  const sortedByLastPlayed = friends.some((f) => f.stats?.lastPlayedAt);

  return (
    <AppShell flush>
      <div className="leading-[normal]">
        <div className="flex items-center justify-between px-2 pt-2">
          <SmartLink
            href="/profile"
            aria-label={t('backLabel')}
            className="flex size-11 items-center justify-center text-text"
          >
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </SmartLink>
          <Kicker>{tProfile('kicker')}</Kicker>
          <span aria-hidden className="w-11" />
        </div>

        <div className="px-5 pt-1.5">
          <h1 className="font-serif text-[30px] font-medium">{t('kicker')}</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {friends.length === 0 ? t('subtitle') : t('subtitleWithCount', { count: friends.length })}
          </p>
        </div>

        {statusBanner && (
          <div className="mx-4 mt-3.5">
            <Banner tone={statusBanner.tone}>{statusBanner.text}</Banner>
          </div>
        )}

        {inviteEmail && (
          <div className="mx-4 mt-3.5">
            <Card>
              <p className="mb-3 font-sans text-[15px] text-text">
                {t('invitePrompt', { email: inviteEmail })}
              </p>
              <form action={sendFriendInvite} className="flex items-center gap-2">
                <input type="hidden" name="email" value={inviteEmail} />
                <input type="hidden" name="return" value="venner" />
                <SubmitButton pendingLabel={t('invitePending')}>
                  {t('inviteButton', { email: inviteEmail })}
                </SubmitButton>
              </form>
            </Card>
          </div>
        )}

        <GetTheGangCard
          // A new status remounts the card, so `?status=email_required` opens
          // the field again and a sent request folds it away.
          key={statusCode ?? ''}
          ownInitials={nameInitials(own.data?.name)}
          sharePath={friendCode ? `/venner/legg-til/${friendCode}` : null}
          emailOpenAtStart={statusCode === 'email_required'}
          addByEmailAction={addFriendByEmail}
          text={{
            title: t('heroTitle'),
            shareLine: t('shareLinkSubtitle'),
            emailLine: t('addByEmailSubtitle'),
            shareButton: t('heroShareButton'),
            emailButton: t('heroEmailButton'),
            copied: t('copiedLabel'),
            promptFallback: t('copyPromptFallback'),
            emailLabel: t('addEmailLabel'),
            emailPlaceholder: t('addEmailPlaceholder'),
            emailPending: t('addEmailPending'),
            emailAdd: t('addEmailButton'),
          }}
        />

        {incoming.length > 0 && (
          <section aria-labelledby="friends-incoming" data-testid="friends-incoming">
            <Kicker as="h2" id="friends-incoming" tone="accent" className={SECTION_KICKER}>
              {t('incomingSection')}
            </Kicker>
            <ul className="mx-4 flex flex-col gap-2">
              {incoming.map((r) => (
                <li
                  key={r.requestId}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
                >
                  <Avatar initials={r.initials} className="bg-primary-soft text-primary" />
                  <NameBlock
                    name={displayName(r)}
                    sub={r.stats?.lastGameName ? t('playedWithYouIn', { game: r.stats.lastGameName }) : null}
                  />
                  {/* `contents`: the buttons are the row's flex items, as drawn. */}
                  <form action={respondFriendRequest} className="contents">
                    <input type="hidden" name="request_id" value={r.requestId} />
                    <input type="hidden" name="accept" value="1" />
                    <SubmitButton
                      size="compact"
                      aria-label={t('acceptA11y', { name: displayName(r) })}
                      pendingLabel={t('acceptPending')}
                    >
                      {t('acceptLabel')}
                    </SubmitButton>
                  </form>
                  <form action={respondFriendRequest} className="contents">
                    <input type="hidden" name="request_id" value={r.requestId} />
                    <input type="hidden" name="accept" value="0" />
                    <SubmitButton
                      variant="secondary"
                      size="chip"
                      aria-label={t('declineA11y', { name: displayName(r) })}
                      pendingLabel=""
                      className="tap-extend w-11 shrink! px-1.5! text-[16px]! leading-[normal]! font-normal! text-muted!"
                    >
                      ✕
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {suggestions.length > 0 && (
          <section aria-labelledby="friends-suggestions" data-testid="friends-suggestions">
            <Kicker as="h2" id="friends-suggestions" className={SECTION_KICKER}>
              {t('suggestionsSection')}
            </Kicker>
            <ul data-focus-inset className="flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="flex w-[176px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-border bg-surface p-3"
                >
                  <Avatar initials={s.initials} className="bg-meter-track text-muted dark:text-text" />
                  <NameBlock
                    name={displayName(s)}
                    sub={rounds(s.stats)}
                    nameClass="text-[14px]"
                    className="min-w-0"
                  />
                  {/* At the bottom, so the buttons line up when a card has no subline. */}
                  <form action={sendFriendRequest} className="mt-auto">
                    <input type="hidden" name="addressee_id" value={s.id} />
                    <SubmitButton
                      variant="outline"
                      size="compact"
                      className="w-full"
                      aria-label={t('suggestionAddA11y', { name: displayName(s) })}
                      pendingLabel={t('addEmailPending')}
                    >
                      {t('suggestionAddLabel')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="friends-list" data-testid="friends-list">
          <div className={`flex items-baseline justify-between ${SECTION_KICKER}`}>
            <Kicker as="h2" id="friends-list">
              {t('friendsSectionCount', { count: friends.length })}
            </Kicker>
            {sortedByLastPlayed && (
              <span className="text-[12px] text-muted">{t('sortedByLastPlayed')}</span>
            )}
          </div>
          {/* The rows run edge to edge in a clipping card: draw focus inside. */}
          <div data-focus-inset className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
            {friends.length === 0 ? (
              <p className="px-3.5 py-3 text-[14px] text-muted">{t('noFriendsYet')}</p>
            ) : (
              <ul>
                {friends.map((f, i) => (
                  <li key={f.id}>
                    <SmartLink
                      href={`/profile/venner/fjern/${f.id}`}
                      data-testid="friends-row"
                      // The divider sits inside the 60 px row, as drawn.
                      className={`flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 text-text no-underline ${
                        i < friends.length - 1 ? 'border-b border-row-divider-warm' : ''
                      }`}
                    >
                      <Avatar initials={f.initials} className="bg-surface-strong text-bg-tint" />
                      <NameBlock name={displayName(f)} sub={friendSubline(f)} />
                      {/* Inter has no arrow; the artboard falls back to the system font. */}
                      <span aria-hidden className="font-[system-ui] text-primary">
                        →
                      </span>
                      <span className="sr-only">{t('removeRowA11y', { name: displayName(f) })}</span>
                    </SmartLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {outgoing.length > 0 && (
          <section aria-labelledby="friends-outgoing" data-testid="friends-outgoing">
            <Kicker as="h2" id="friends-outgoing" className={SECTION_KICKER}>
              {t('outgoingSection')}
            </Kicker>
            <ul className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface">
              {outgoing.map((r, i) => (
                <li
                  key={r.requestId}
                  className={`flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 ${
                    i < outgoing.length - 1 ? 'border-b border-row-divider-warm' : ''
                  }`}
                >
                  <Avatar initials={r.initials} className="bg-primary-soft text-primary" />
                  <NameBlock name={displayName(r)} sub={rounds(r.stats)} />
                  <form action={removeFriend} className="contents">
                    <input type="hidden" name="other_id" value={r.id} />
                    <SubmitButton variant="outline" size="compact" pendingLabel={t('withdrawPending')}>
                      {t('withdrawLabel')}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}
