import { useTranslations } from 'next-intl';
import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { MailEnvelope } from '@/components/icons';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { isInviteExpired } from '@/lib/auth/inviteExpiry';
import type { AppLocale } from '@/i18n/routing';
import { resendInvitation } from '../actions';
import { SubmitButton } from '@/components/ui/SubmitButton';

type PendingInvitation = {
  id: string;
  email: string;
  created_at: string;
  opened_at: string | null;
  expires_at: string;
};

type PlayersT = ReturnType<typeof useTranslations<'admin.players'>>;

/**
 * Locale-aware relative time for recent invitation timestamps.
 *
 * Granularity is deliberately different from formatRelativeLocale (uses
 * abbreviated hours "t"/"h", "yesterday", falls back to short date for
 * > 7 days). Norwegian output is byte-identical to the old hand-rolled
 * timeAgo() function.
 */
function makeTimeAgo(t: PlayersT, locale: AppLocale) {
  return function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return t('timeAgo.justNow');
    if (mins < 60) return t('timeAgo.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('timeAgo.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days === 1) return t('timeAgo.yesterday');
    if (days < 7) return t('timeAgo.daysAgo', { count: days });
    // Fall back to short date for older stamps
    return formatShortDateLocale(iso, locale);
  };
}

export async function PendingInvitations() {
  const supabase = await getServerClient();
  const [t, locale] = await Promise.all([
    getTranslations('admin.players'),
    getLocale() as Promise<AppLocale>,
  ]);
  const timeAgo = makeTimeAgo(t as unknown as PlayersT, locale);

  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, created_at, opened_at, expires_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
    .returns<PendingInvitation[]>();

  if (error) throw error;
  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-10 flex flex-col items-center text-center">
        <ChampagneMedallion size={64} className="mb-4">
          <MailEnvelope size={32} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <p className="font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
          {t('emptyPendingHeading')}
        </p>
        <p className="mt-1 max-w-[260px] font-sans text-[12.5px] leading-relaxed text-muted">
          {t('emptyPendingBody')}
        </p>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
    >
      {items.map((inv, i) => (
        <PendingRow
          key={inv.id}
          inv={inv}
          index={i}
          // Judged against server time inside the helper (same reason timeAgo
          // reads the clock there) — no client clock skew decides the badge.
          expiredLabel={isInviteExpired(inv.expires_at) ? t('expiredBadge') : null}
          sentDate={t('sentDate', { date: formatShortDateLocale(inv.created_at, locale) })}
          openedAtLabel={
            inv.opened_at ? t('openedAt', { relative: timeAgo(inv.opened_at) }) : null
          }
          notOpenedLabel={t('notOpened')}
          resendButton={t('resendButton')}
          resendingBusy={t('resendingBusy')}
          withdrawButton={t('withdrawButton')}
        />
      ))}
    </div>
  );
}

/**
 * Danger-tinted twin of the muted GuestBadge pill. Local to this page: the
 * shared badges take no tone-prop, and the waiting list is so far the only
 * flate that needs to mark a row as dead. Same border/color pair the «trekk
 * tilbake»-link on the row already uses.
 */
function ExpiredBadge({ label }: { label: string }) {
  return (
    <span
      data-testid="invitation-expired-badge"
      className="inline-block shrink-0 rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium"
      style={{
        borderColor: 'rgba(180, 60, 60, 0.3)',
        background: 'transparent',
        color: 'var(--danger)',
      }}
    >
      {label}
    </span>
  );
}

function PendingRow({
  inv,
  index,
  expiredLabel,
  sentDate,
  openedAtLabel,
  notOpenedLabel,
  resendButton,
  resendingBusy,
  withdrawButton,
}: {
  inv: PendingInvitation;
  index: number;
  expiredLabel: string | null;
  sentDate: string;
  openedAtLabel: string | null;
  notOpenedLabel: string;
  resendButton: string;
  resendingBusy: string;
  withdrawButton: string;
}) {
  return (
    <div
      className="reveal-up flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
      style={{
        animationDelay: `${60 + index * 50}ms`,
        borderTop: index === 0 ? 'none' : '1px solid var(--row-divider-warm)',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
            {inv.email}
          </p>
          {expiredLabel && <ExpiredBadge label={expiredLabel} />}
        </div>
        <p className="mt-0.5 font-sans text-[11.5px] tabular-nums text-muted">
          {sentDate}
        </p>
        <p className="mt-0.5 font-sans text-[11px] text-muted">
          {openedAtLabel ? (
            <span style={{ color: 'var(--success)' }}>
              {openedAtLabel}
            </span>
          ) : (
            <span>{notOpenedLabel}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <form action={resendInvitation}>
          <input type="hidden" name="id" value={inv.id} />
          <SubmitButton
            className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-surface px-4 py-2 font-sans text-[13px] font-medium text-text transition hover:bg-row-hover"
            pendingLabel={resendingBusy}
          >
            {resendButton}
          </SubmitButton>
        </form>
        <SmartLink
          href={`/admin/spillere/invitations/${inv.id}/trekk-tilbake`}
          className="inline-flex min-h-[44px] items-center rounded-full border px-4 py-2 font-sans text-[13px] font-medium transition"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.3)',
            color: 'var(--danger-deep)',
          }}
        >
          {withdrawButton}
        </SmartLink>
      </div>
    </div>
  );
}
