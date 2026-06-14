import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { getQuotaState, timeUntilStructured } from '@/lib/invitations/quota';
import { updateProfile } from './actions';
import { safeNextPath } from './safeNext';
import { sendFriendInvite } from '../invite/actions';
import { ProfileFormBody } from './ProfileFormBody';
import { InviteFriendForm } from './InviteFriendForm';
import { SmartLink } from '@/components/ui/SmartLink';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SettingRow, SettingList } from '@/components/ui/SettingRow';
import { InstallButton } from '@/components/pwa/InstallButton';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { formatHcpDisplay } from '@/lib/handicap/sign';
import type { AppLocale } from '@/i18n/routing';

type SearchParams = Promise<{
  error?: string | string[];
  profile?: string | string[];
  invite?: string | string[];
  invite_error?: string | string[];
  invite_email?: string | string[];
  next?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const getProfileContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile');
  const { userId } = await getProfileContext();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode && t.has(`errors.${errorCode}` as Parameters<typeof t>[0])
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : errorCode ? t('errors.unknown') : undefined;
  const profileUpdated = first(params.profile) === 'updated';
  const nextSafe = safeNextPath(first(params.next));
  const inviteSent = first(params.invite) === 'sent';
  const inviteSentEmail = first(params.invite_email) ?? '';
  const inviteErrorCode = first(params.invite_error);
  const inviteErrorMessage = inviteErrorCode && t.has(`inviteErrors.${inviteErrorCode}` as Parameters<typeof t>[0])
    ? t(`inviteErrors.${inviteErrorCode}` as Parameters<typeof t>[0])
    : inviteErrorCode ? t('inviteErrors.unknown') : undefined;

  return (
    <AppShell>
      <TopBar backHref="/" backLabel={t('backLabel')} kicker={t('kicker')} />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">{t('updatedBanner')}</Banner>
        </div>
      )}

      {inviteSent && (
        <div className="mb-4">
          <Banner tone="success">
            {t('inviteSentBanner', { email: inviteSentEmail || 'empty' })}
          </Banner>
        </div>
      )}

      {inviteErrorMessage && (
        <div className="mb-4">
          <Banner tone="error">{inviteErrorMessage}</Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <GenderSoftPrompt />
      </Suspense>

      <Suspense fallback={<ProfileFormSkeleton />}>
        <ProfileFormCard errorMessage={errorMessage} next={nextSafe} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-[88px] rounded-2xl" />}>
          <InviteAFriendCard />
        </Suspense>
      </div>

      <div className="mt-8">
        <SettingList ariaLabel={t('accountSection')}>
          <SettingRow
            href="/profile/venner"
            label={t('friendsRow')}
            sublabel={t('friendsSublabel')}
          />
          <SettingRow href="/profile/historikk" label={t('historikkRow')} />
          <SettingRow href="/profile/statistikk" label={t('statistikkRow')} />
          <div className="flex w-full items-center justify-between gap-3 min-h-[56px] px-5 py-3 border-t border-border first:border-t-0">
            <span className="font-serif text-base font-medium text-text">
              {t('languageRowLabel')}
            </span>
            <LocaleSwitcher />
          </div>
          <InstallButton />
          <SettingRow
            href="/profile/export"
            download
            label={t('exportRow')}
          />
          <SettingRow
            href="/profile/slett-konto"
            label={t('deleteRow')}
            tone="danger"
          />
        </SettingList>
      </div>

      <AccountActions />
    </AppShell>
  );
}

/**
 * Konto-handling nederst på Profil-siden. «Logg ut» er en konto-handling og
 * bor her. «Sekretariatet» (admin-rommet) ble flyttet til Hjem — der admin
 * lander og lett finner den — så den ligger ikke lenger her (#355-oppfølging).
 */
async function AccountActions() {
  const t = await getTranslations('profile');
  return (
    <div className="mt-8 border-t border-border/60 pt-6 dark:border-border/80">
      <form action="/logout" method="post">
        <SubmitButton variant="secondary" className="w-full" pendingLabel={t('logoutPending')}>
          {t('logoutButton')}
        </SubmitButton>
      </form>
    </div>
  );
}

async function ProfileFormCard({
  errorMessage,
  next,
}: {
  errorMessage: string | undefined;
  next: string | null;
}) {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile');
  const { supabase, userId } = await getProfileContext();

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select(
      'name, nickname, hcp_index, handicap_updated_at, email, profile_completed_at, gender, level',
    )
    .eq('id', userId!)
    .single();

  // Old logic was: "no row" means not yet onboarded — but the auth.users trigger
  // now pre-creates a placeholder row, so check the completion timestamp instead.
  if (profileError) {
    throw profileError;
  }
  if (!profile?.profile_completed_at) {
    redirect({ href: '/complete-profile', locale });
  }

  const displayName = profile.name ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const hcpDisplay =
    profile.hcp_index == null
      ? '–'
      : formatHcpDisplay(profile.hcp_index, locale);

  return (
    <Card>
      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft font-serif text-lg font-medium text-text">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="font-serif text-lg font-medium text-text leading-tight truncate">
            {displayName || t('displayNameFallback')}
          </p>
          <p className="text-sm text-muted tabular-nums">hcp {hcpDisplay}</p>
        </div>
      </div>
      <ProfileFormBody
        email={profile.email}
        handicapUpdatedAt={profile.handicap_updated_at}
        initial={{
          name: profile.name ?? '',
          nickname: profile.nickname ?? '',
          hcpIndex:
            profile.hcp_index == null ? '' : String(profile.hcp_index),
          gender: profile.gender,
          level: profile.level,
        }}
        action={updateProfile}
        next={next}
      />
    </Card>
  );
}

async function GenderSoftPrompt() {
  const t = await getTranslations('profile');
  const { supabase, userId } = await getProfileContext();
  if (!userId) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('gender')
    .eq('id', userId)
    .single();
  if (!profile || profile.gender !== null) return null;

  return (
    <div className="mb-4">
      <Card>
        <h2 className="font-serif text-base font-medium text-text mb-1">
          {t('genderPrompt.heading')}
        </h2>
        <p className="text-sm text-muted mb-3">
          {t('genderPrompt.body')}
        </p>
        <SmartLink
          href="#kjonn"
          className="inline-flex items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg hover:bg-primary/90 transition-colors"
        >
          {t('genderPrompt.cta')}
        </SmartLink>
      </Card>
    </div>
  );
}

function ProfileFormSkeleton() {
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <Skeleton className="h-3.5 w-12 mb-1.5" />
          <Skeleton className="h-4 w-48" delay={30} />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" delay={60} />
        <Skeleton className="h-12 w-full rounded-lg" delay={120} />
        <Skeleton className="h-12 w-full rounded-lg" delay={180} />
        <Skeleton className="h-10 w-24 rounded-full" delay={240} />
      </div>
    </Card>
  );
}

async function InviteAFriendCard() {
  const t = await getTranslations('profile');
  const { supabase, userId } = await getProfileContext();
  const quota = await getQuotaState(supabase, userId!);

  if (quota.isExhausted) {
    const timeUntilResult = quota.nextSlotAt
      ? timeUntilStructured(quota.nextSlotAt)
      : null;

    let timeUntilStr: string;
    if (!timeUntilResult || timeUntilResult.kind === 'soon') {
      timeUntilStr = t('invite.exhaustedSoon');
    } else if (timeUntilResult.kind === 'hours') {
      timeUntilStr = `${timeUntilResult.n} t`;
    } else {
      timeUntilStr = `${timeUntilResult.n} min`;
    }

    return (
      <Card>
        <div aria-disabled="true" className="opacity-60">
          <h2 className="font-serif text-base font-medium text-text mb-0.5">
            {t('invite.heading')}
          </h2>
          <p className="text-sm text-muted">
            {t('invite.exhaustedSubtitle', { timeUntil: timeUntilStr })}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-3">
        <h2 className="font-serif text-base font-medium text-text mb-0.5">
          {t('invite.heading')}
        </h2>
        <p className="text-sm text-muted">{t('invite.subtitle')}</p>
      </div>
      <InviteFriendForm action={sendFriendInvite} />
    </Card>
  );
}
