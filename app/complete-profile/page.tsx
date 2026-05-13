import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { completeProfile } from './actions';

type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Du må fylle inn navn.',
  hcp_invalid: 'Handicap-index må være et tall mellom -10 og 54.0.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function CompleteProfile({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }
  const supabase = await getServerClient();

  // If the user has already completed their profile, send them home.
  // The trigger pre-creates a placeholder row with profile_completed_at = NULL,
  // so the row existing is not enough on its own.
  const { data: existing } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.profile_completed_at) {
    redirect('/');
  }

  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <PageHeader title="Fullfør profilen din" />

      <Card>
        <p className="text-sm text-muted mb-5">
          Velkommen! Fyll inn detaljene dine for å fullføre registreringen.
        </p>

        {errorMessage && (
          <div className="mb-4">
            <Banner tone="error">{errorMessage}</Banner>
          </div>
        )}

        <form action={completeProfile} className="space-y-4">
          <Input
            id="name"
            name="name"
            type="text"
            label="Navn"
            autoComplete="name"
            required
          />

          <Input
            id="nickname"
            name="nickname"
            type="text"
            label="Kallenavn"
            hint="Valgfritt — det navnet folk kjenner deg som på banen"
            autoComplete="nickname"
          />

          <Input
            id="hcp_index"
            name="hcp_index"
            type="number"
            label="Handicap-index"
            hint="Tallet du har i Golfbox akkurat nå"
            step="0.1"
            min={-10}
            max={54.0}
            required
            inputMode="decimal"
            inputClassName="score-num"
          />

          <Button type="submit" className="w-full">
            Fullfør profilen
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
