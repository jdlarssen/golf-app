import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
import { updateProfile } from './actions';
import { sendFriendInvite } from '../invite/actions';
import { ProfileFormBody } from './ProfileFormBody';
import { InviteFriendForm } from './InviteFriendForm';
import { SmartLink } from '@/components/ui/SmartLink';

type SearchParams = Promise<{
  error?: string | string[];
  profile?: string | string[];
  invite?: string | string[];
  invite_error?: string | string[];
  invite_email?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Du må fylle inn navn.',
  hcp_invalid: 'Handicap-index må være et tall mellom -10 og 54.0.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må skrive inn en e-postadresse.',
  invalid_email: 'Ugyldig e-postadresse.',
  already_user:
    'Denne personen er allerede på Tørny. Be admin om å legge dem til et spill.',
  quota: 'Du har brukt opp dagens kvote.',
  rate_limited: 'Vent litt før du prøver igjen.',
  unknown: 'Noe gikk galt med invitasjonen. Prøv igjen.',
};

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
  const { userId } = await getProfileContext();
  if (!userId) {
    redirect('/login');
  }

  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const profileUpdated = first(params.profile) === 'updated';
  const inviteSent = first(params.invite) === 'sent';
  const inviteSentEmail = first(params.invite_email);
  const inviteErrorCode = first(params.invite_error);
  const inviteErrorMessage = inviteErrorCode
    ? INVITE_ERROR_MESSAGES[inviteErrorCode]
    : undefined;

  return (
    <AppShell>
      <div className="-mt-3 mb-4">
        <BackLink href="/">Tilbake til hjem</BackLink>
      </div>
      <PageHeader
        title="Min profil"
        subtitle="Oppdater detaljene dine"
      />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">✓ Profilen din er oppdatert.</Banner>
        </div>
      )}

      {inviteSent && (
        <div className="mb-4">
          <Banner tone="success">
            ✓ Invitasjon sendt{inviteSentEmail ? ` til ${inviteSentEmail}` : ''}.
          </Banner>
        </div>
      )}

      {inviteErrorMessage && (
        <div className="mb-4">
          <Banner tone="error">{inviteErrorMessage}</Banner>
        </div>
      )}

      <Suspense fallback={<ProfileFormSkeleton />}>
        <ProfileFormCard errorMessage={errorMessage} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-[88px] rounded-2xl" />}>
          <InviteAFriendCard />
        </Suspense>
      </div>

      <div className="mt-6">
        <GdprSection />
      </div>
    </AppShell>
  );
}

async function ProfileFormCard({
  errorMessage,
}: {
  errorMessage: string | undefined;
}) {
  const { supabase, userId } = await getProfileContext();

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, nickname, hcp_index, email, profile_completed_at')
    .eq('id', userId!)
    .single();

  // Old logic was: "no row" means not yet onboarded — but the auth.users trigger
  // now pre-creates a placeholder row, so check the completion timestamp instead.
  if (profileError) {
    throw profileError;
  }
  if (!profile?.profile_completed_at) {
    redirect('/complete-profile');
  }

  return (
    <Card>
      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      <ProfileFormBody
        email={profile.email}
        initial={{
          name: profile.name ?? '',
          nickname: profile.nickname ?? '',
          hcpIndex:
            profile.hcp_index == null ? '' : String(profile.hcp_index),
        }}
        action={updateProfile}
      />
    </Card>
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
  const { supabase, userId } = await getProfileContext();
  const quota = await getQuotaState(supabase, userId!);

  if (quota.isExhausted) {
    return (
      <Card>
        <div aria-disabled="true" className="opacity-60">
          <h2 className="font-serif text-lg font-medium text-text mb-1">
            Invitér en venn
          </h2>
          <p className="text-sm text-muted">
            Ny invitasjon om ~
            {quota.nextSlotAt ? formatTimeUntil(quota.nextSlotAt) : 'snart'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="font-serif text-lg font-medium text-text mb-1">
          Invitér en venn
        </h2>
        <p className="text-sm text-muted">Dra med kompiser inn på Tørny</p>
      </div>
      <InviteFriendForm action={sendFriendInvite} />
    </Card>
  );
}

function GdprSection() {
  return (
    <div className="space-y-3">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted px-1">
        Mine data
      </p>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-base font-medium text-text">
              Eksporter mine data
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Last ned alt Tørny har lagret om deg
            </p>
          </div>
          <a
            href="/profile/export"
            download
            className="shrink-0 ml-4 rounded-full border border-border bg-surface px-4 py-2 font-sans text-[13px] font-medium text-text hover:bg-bg transition-colors"
          >
            Last ned
          </a>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-base font-medium text-[#a04040]">
              Slett konto
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Fjern kontoen din permanent
            </p>
          </div>
          <SmartLink
            href="/profile/slett-konto"
            className="shrink-0 ml-4 rounded-full border border-[#a04040]/40 px-4 py-2 font-sans text-[13px] font-medium text-[#a04040] hover:bg-[#fff0f0] dark:hover:bg-[#2a1515] transition-colors"
          >
            Slett konto
          </SmartLink>
        </div>
      </Card>
    </div>
  );
}
