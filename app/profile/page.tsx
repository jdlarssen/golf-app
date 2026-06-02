import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
import { updateProfile } from './actions';
import { safeNextPath } from './safeNext';
import { sendFriendInvite } from '../invite/actions';
import { ProfileFormBody } from './ProfileFormBody';
import { InviteFriendForm } from './InviteFriendForm';
import { SmartLink } from '@/components/ui/SmartLink';
import { Button } from '@/components/ui/Button';
import { SettingRow, SettingList } from '@/components/ui/SettingRow';
import { InstallButton } from '@/components/pwa/InstallButton';
import { fromSignedHcp, formatGolfboxHcp } from '@/lib/handicap/sign';

type SearchParams = Promise<{
  error?: string | string[];
  profile?: string | string[];
  invite?: string | string[];
  invite_error?: string | string[];
  invite_email?: string | string[];
  next?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Du må fylle inn navn.',
  hcp_invalid: 'Handicap-index må være et tall mellom -10 og 54,0.',
  gender_required: 'Velg kjønn.',
  level_invalid: 'Ugyldig spillerklasse.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må skrive inn en e-postadresse.',
  invalid_email: 'Ugyldig e-postadresse.',
  already_user:
    'Denne personen er allerede på Tørny. Be admin om å legge dem til et spill.',
  already_invited: 'Denne adressen er allerede invitert. Du trenger ikke gjøre noe mer.',
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
  const nextSafe = safeNextPath(first(params.next));
  const inviteSent = first(params.invite) === 'sent';
  const inviteSentEmail = first(params.invite_email);
  const inviteErrorCode = first(params.invite_error);
  const inviteErrorMessage = inviteErrorCode
    ? INVITE_ERROR_MESSAGES[inviteErrorCode]
    : undefined;

  return (
    <AppShell>
      <TopBar backHref="/" backLabel="Tilbake til hjem" kicker="Profil" />

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
        <SettingList ariaLabel="Konto og mer">
          <SettingRow href="/profile/historikk" label="Min historikk" />
          <SettingRow href="/profile/statistikk" label="Klubbstatistikker" />
          <InstallButton />
          <SettingRow
            href="/profile/export"
            download
            label="Eksporter mine data"
          />
          <SettingRow
            href="/profile/slett-konto"
            label="Slett konto"
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
function AccountActions() {
  return (
    <div className="mt-8 border-t border-border/60 pt-6 dark:border-border/80">
      <form action="/logout" method="post">
        <Button type="submit" variant="secondary" className="w-full">
          Logg ut
        </Button>
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
    redirect('/complete-profile');
  }

  const displayName = profile.name ?? '';
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const hcpDisplay =
    profile.hcp_index == null
      ? '–'
      : (() => {
          const { magnitude, isPlus } = fromSignedHcp(profile.hcp_index);
          return formatGolfboxHcp(magnitude, isPlus);
        })();

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
            {displayName || 'Profil'}
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
          Velg kjønn for tee-anbefaling
        </h2>
        <p className="text-sm text-muted mb-3">
          Tørny vet ikke hvilken tee du normalt spiller fra. Sett det her, så
          går det raskere når noen oppretter et spill du skal være med på.
        </p>
        <SmartLink
          href="#kjonn"
          className="inline-flex items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg hover:bg-primary/90 transition-colors"
        >
          Sett kjønn
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
  const { supabase, userId } = await getProfileContext();
  const quota = await getQuotaState(supabase, userId!);

  if (quota.isExhausted) {
    return (
      <Card>
        <div aria-disabled="true" className="opacity-60">
          <h2 className="font-serif text-base font-medium text-text mb-0.5">
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
      <div className="mb-3">
        <h2 className="font-serif text-base font-medium text-text mb-0.5">
          Invitér en venn
        </h2>
        <p className="text-sm text-muted">Dra med kompiser inn på Tørny</p>
      </div>
      <InviteFriendForm action={sendFriendInvite} />
    </Card>
  );
}

