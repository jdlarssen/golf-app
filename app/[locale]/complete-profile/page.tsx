import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Kicker } from '@/components/ui/Kicker';
import { completeProfile } from './actions';
import { OnboardingHcpField } from './OnboardingHcpField';
import { OnboardingProgress } from './OnboardingProgress';
import { first, resolveErrorCode } from '@/lib/url/searchParams';

type SearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
  name?: string | string[];
  hcp_index?: string | string[];
  hcp_plus?: string | string[];
}>;

/** Only accept same-origin relative paths as a post-onboarding destination. */
function safeNext(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

// The set of valid error codes that map to a catalog key.
const KNOWN_ERROR_CODES = new Set([
  'name_required',
  'hcp_invalid',
  'unknown',
] as const);

export default async function CompleteProfile({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('onboarding');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }
  const supabase = await getServerClient();

  const params = await searchParams;
  // #356: carry the post-onboarding destination (e.g. a game-scoped invitee's
  // `/games/[id]`) through the profile step so the user lands there afterwards.
  const next = safeNext(first(params.next));

  // #748: echo submitted values back into the form after a validation bounce
  // so the user doesn't have to retype everything.
  const echoName = first(params.name) ?? '';
  const echoHcpIndex = first(params.hcp_index) ?? '';
  const echoHcpPlus = first(params.hcp_plus) === 'on';

  // If the user has already completed their profile, send them on. The trigger
  // pre-creates a placeholder row with profile_completed_at = NULL, so the row
  // existing is not enough on its own.
  const { data: existing } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.profile_completed_at) {
    redirect(next);
  }

  const errorCode = resolveErrorCode(first(params.error), KNOWN_ERROR_CODES, 'unknown');
  const errorMessage = errorCode ? t(`errors.${errorCode}`) : undefined;

  return (
    <AppShell>
      <header className="mb-8">
        <Kicker tone="accent" className="mb-2">
          {t('kicker')}
        </Kicker>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-tight">
          {t('heading')}
        </h1>
        <p className="font-sans text-sm leading-relaxed text-muted mt-2">
          {t('subheading')}
        </p>
      </header>

      <OnboardingProgress />

      <Card>
        {errorMessage && (
          <div className="mb-4">
            <Banner tone="error">{errorMessage}</Banner>
          </div>
        )}

        <form action={completeProfile} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          <Input
            id="name"
            name="name"
            type="text"
            label={t('nameLabel')}
            autoComplete="name"
            defaultValue={echoName}
            required
          />

          <OnboardingHcpField initialMagnitude={echoHcpIndex} initialPlus={echoHcpPlus} />

          <SubmitButton className="w-full mt-2" pendingLabel={t('submitPending')}>
            {t('submitButton')}
          </SubmitButton>
        </form>
      </Card>
    </AppShell>
  );
}
