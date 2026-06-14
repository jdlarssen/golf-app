import { first } from '@/lib/url/searchParams';
import { useTranslations } from 'next-intl';
import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { formatShortDateWithYearLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { updateUser } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

type ProfileT = ReturnType<typeof useTranslations<'admin.players.profile'>>;

/**
 * Locale-aware relative time for player activity.
 *
 * Granularity is deliberately different from formatRelativeLocale (no weeks,
 * uses singular/plural forms for hours/days/months). Norwegian output is
 * byte-identical to the old hand-rolled relativeNb() function.
 */
function makeRelative(t: ProfileT) {
  return function relative(iso: string | null | undefined): string {
    if (!iso) return t('relativeNb.never');
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 2) return t('relativeNb.justNow');
    if (mins < 60) return t('relativeNb.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return hours === 1
        ? t('relativeNb.hourAgo')
        : t('relativeNb.hoursAgo', { count: hours });
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
      return days === 1
        ? t('relativeNb.dayAgo')
        : t('relativeNb.daysAgo', { count: days });
    }
    const months = Math.floor(days / 30);
    if (months < 12) {
      return months === 1
        ? t('relativeNb.monthAgo')
        : t('relativeNb.monthsAgo', { count: months });
    }
    const years = Math.floor(months / 12);
    return t('relativeNb.yearsAgo', { count: years });
  };
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const status = first(sp.status);
  const errorCode = first(sp.error);

  const supabase = await getServerClient();
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223).
  await requireAdmin(supabase);
  const adminUserId = await getProxyVerifiedUserId();

  const locale = (await getLocale()) as AppLocale;
  const tProfile = await getTranslations('admin.players.profile');
  const tNav = await getTranslations('admin.nav');
  const relative = makeRelative(tProfile as unknown as ProfileT);

  const errorMessage = errorCode
    ? tProfile(`errors.${errorCode}` as Parameters<typeof tProfile>[0])
    : undefined;

  const { data: target, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at, last_seen_at, gender, level')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!target) notFound();

  // Count game_players rows (used for block-condition and activity stats).
  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);

  const isSelf = target.id === adminUserId;
  const hasPlayed = (gamePlayerCount ?? 0) > 0;
  const canDelete = !isSelf && !hasPlayed;

  // Pending invitees have NULL name until they finish profile.
  const displayName = target.name?.trim() || target.email;

  let deleteBlockReason: string | null = null;
  if (isSelf) deleteBlockReason = tProfile('deleteBlockSelf');
  else if (hasPlayed) {
    const firstName = target.name?.trim().split(/\s+/)[0] || 'Spilleren';
    deleteBlockReason = tProfile('deleteBlockHasPlayed', {
      firstName,
      count: gamePlayerCount ?? 0,
    });
  }

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/spillere"
        kicker={tNav('klubbhus')}
      />

      <BrassRibbon kicker={tProfile('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {displayName}
        </h1>
        {target.nickname && (
          <p className="font-serif text-[14px] italic text-muted">
            ({target.nickname})
          </p>
        )}
        <p className="mt-1 font-sans text-[11.5px] tabular-nums text-muted">
          {target.email} · {tProfile('registeredAt', { date: formatShortDateWithYearLocale(target.created_at, locale) })}
          {target.is_admin && ` · ${tProfile('superAdmin')}`}
        </p>
      </div>

      {(status === 'updated' || errorMessage) && (
        <div className="mt-4 space-y-2">
          {status === 'updated' && (
            <Banner tone="success">{tProfile('updatedBanner')}</Banner>
          )}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {/* Activity section */}
      <section className="mt-5">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {tProfile('activitySection')}
        </p>
        <div
          className="rounded-xl border border-border bg-surface px-4 py-3.5"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <dl className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-[13px] text-muted">{tProfile('lastSeenLabel')}</dt>
              <dd className="font-sans text-[13px] tabular-nums text-text">
                {relative(target.last_seen_at)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-[13px] text-muted">{tProfile('gameCountLabel')}</dt>
              <dd className="font-sans text-[13px] tabular-nums text-text">
                {gamePlayerCount ?? 0}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Edit form */}
      <section className="mt-5">
        <div
          className="rounded-xl border border-border bg-surface p-4"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <form action={updateUser} className="space-y-3">
            <input type="hidden" name="id" value={target.id} />
            <Input
              id="name"
              name="name"
              label={tProfile('formName')}
              defaultValue={target.name ?? ''}
              required
            />
            <Input
              id="nickname"
              name="nickname"
              label={tProfile('formNickname')}
              defaultValue={target.nickname ?? ''}
              placeholder={tProfile('formNicknamePlaceholder')}
            />
            <Input
              id="email"
              name="email"
              type="email"
              label={tProfile('formEmail')}
              defaultValue={target.email}
              required
            />
            <Input
              id="hcp_index"
              name="hcp_index"
              type="number"
              step="0.1"
              min="-10"
              max="54"
              label={tProfile('formHcp')}
              defaultValue={target.hcp_index.toString()}
              required
            />
            <fieldset>
              <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                {tProfile('formGenderLegend')}
              </legend>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="mens"
                    defaultChecked={target.gender === 'mens'}
                    required
                  />
                  <span className="font-serif text-base text-text">{tProfile('genderMens')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="ladies"
                    defaultChecked={target.gender === 'ladies'}
                    required
                  />
                  <span className="font-serif text-base text-text">{tProfile('genderLadies')}</span>
                </label>
              </div>
              <p className="mt-1 text-xs text-muted">
                {tProfile('genderHint')}
              </p>
            </fieldset>
            <fieldset>
              <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                {tProfile('formLevelLegend')}
              </legend>
              <div className="mt-2 flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="level"
                    value="junior"
                    defaultChecked={target.level === 'junior'}
                  />
                  <span className="font-serif text-base text-text">{tProfile('levelJunior')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="level"
                    value="normal"
                    defaultChecked={target.level === 'normal'}
                  />
                  <span className="font-serif text-base text-text">{tProfile('levelNormal')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="level"
                    value="senior"
                    defaultChecked={target.level === 'senior'}
                  />
                  <span className="font-serif text-base text-text">{tProfile('levelSenior')}</span>
                </label>
              </div>
              <p className="mt-1 text-xs text-muted">
                {tProfile('levelHint')}
              </p>
            </fieldset>
            <SubmitButton className="w-full" pendingLabel={tProfile('savingBusy')}>
              {tProfile('saveButton')}
            </SubmitButton>
          </form>
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          {tProfile('dangerZone')}
        </p>
        <div
          className="rounded-xl border bg-surface px-4 py-3.5"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.18)',
            boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          {canDelete ? (
            <div className="text-center">
              <SmartLink
                href={`/admin/spillere/${target.id}/slett`}
                className="font-sans text-[13px] font-medium"
                style={{ color: 'var(--danger-deep)' }}
              >
                {tProfile('deleteLink')}
              </SmartLink>
            </div>
          ) : (
            <p className="text-center font-sans text-[12.5px] text-muted">
              {deleteBlockReason}
            </p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
