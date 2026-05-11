import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { getQuotaState, formatTimeUntil } from '@/lib/invitations/quota';
import { updateProfile } from './actions';

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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, nickname, hcp_index, email')
    .eq('id', user.id)
    .single();

  // No profile row yet → finish registration first.
  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }
  if (profileError) {
    throw profileError;
  }

  const quota = await getQuotaState(supabase, user.id);

  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Min profil"
        subtitle="Oppdater detaljene dine"
      />

      <Card>
        {errorMessage && (
          <div className="mb-4">
            <Banner tone="error">{errorMessage}</Banner>
          </div>
        )}

        <form action={updateProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              E-post
            </label>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {profile.email}
            </p>
            <p className="text-xs text-zinc-500 mt-1.5">
              E-post kan ikke endres her.
            </p>
          </div>

          <Input
            id="name"
            name="name"
            type="text"
            label="Navn"
            defaultValue={profile.name ?? ''}
            autoComplete="name"
            required
          />

          <Input
            id="nickname"
            name="nickname"
            type="text"
            label="Kallenavn"
            hint="Valgfritt — det navnet folk kjenner deg som på banen"
            defaultValue={profile.nickname ?? ''}
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
            defaultValue={profile.hcp_index ?? ''}
            required
            inputMode="decimal"
          />

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit">Lagre</Button>
            <Link
              href="/"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Avbryt
            </Link>
          </div>
        </form>
      </Card>

      <div className="mt-6">
        {quota.isExhausted ? (
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
        ) : (
          <Link
            href="/invite"
            className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-lg font-medium text-text mb-1">
                    Invitér en venn
                  </h2>
                  <p className="text-sm text-muted">
                    Dra med kompiser inn på Tørny
                  </p>
                </div>
                <span aria-hidden="true" className="text-muted text-xl">
                  →
                </span>
              </div>
            </Card>
          </Link>
        )}
      </div>
    </AppShell>
  );
}
