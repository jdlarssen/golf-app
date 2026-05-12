import { SmartLink } from '@/components/ui/SmartLink';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
import { sendFriendInvite } from './actions';

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  email?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }
  const supabase = await getServerClient();

  const quota = await getQuotaState(supabase, userId);

  const params = await searchParams;
  const errorCode = first(params.error);
  const status = first(params.status);
  const sentEmail = first(params.email);
  const showSuccess = status === 'sent';

  const errorMessages: Record<string, string> = {
    email_required: 'Du må skrive inn en e-postadresse.',
    invalid_email: 'Ugyldig e-postadresse.',
    already_user:
      'Denne personen er allerede på Tørny. Be admin om å legge dem til et spill.',
    quota: quota.nextSlotAt
      ? `Du har brukt opp dagens kvote. Ny invitasjon om ~${formatTimeUntil(quota.nextSlotAt)}.`
      : 'Du har brukt opp dagens kvote.',
    rate_limited: 'Vent litt før du prøver igjen.',
    unknown: 'Noe gikk galt. Prøv igjen.',
  };
  const errorMessage = errorCode ? errorMessages[errorCode] : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Invitér en venn"
        subtitle="Send en lenke så vennen kan lage konto"
      />

      {showSuccess && sentEmail && (
        <div role="status" className="mb-4">
          <Banner tone="success">✓ Invitasjon sendt til {sentEmail}.</Banner>
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card>
        {quota.isExhausted ? (
          <div aria-disabled="true" className="opacity-60">
            <p className="text-sm text-text">
              Du har brukt opp dagens kvote. Ny invitasjon om ~
              {quota.nextSlotAt ? formatTimeUntil(quota.nextSlotAt) : 'snart'}.
            </p>
          </div>
        ) : (
          <form action={sendFriendInvite} className="space-y-4">
            <Input
              id="email"
              name="email"
              type="email"
              label="E-post"
              autoComplete="email"
              required
            />

            <Button type="submit" className="w-full mt-2">
              Send invitasjon
            </Button>

            <p className="text-xs text-muted mt-2 text-center">
              Vi sender vennen en mail med en lenke. De kan lage konto med ett klikk.
            </p>
          </form>
        )}
      </Card>

      <div className="mt-4 text-center">
        <SmartLink
          href="/profile"
          className="text-sm text-muted hover:text-text transition-colors"
        >
          Avbryt
        </SmartLink>
      </div>
    </AppShell>
  );
}
