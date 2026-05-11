import { getServerClient } from '@/lib/supabase/server';
import { BackLink } from '@/components/ui/BackLink';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { sendInvitation } from './actions';

type SearchParams = Promise<{
  status?: string | string[];
  email?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må fylle inn en e-postadresse.',
  rate_limited: 'Vent litt før du sender en ny invitasjon.',
  log_failed:
    'Invitasjonen ble sendt, men loggføring feilet. Sjekk databasen.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function formatDate(iso: string): string {
  // Norwegian short date — admin-only page, locale-tolerant.
  try {
    return new Intl.DateTimeFormat('no-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const sentEmail = first(params.email) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const { data: invitations, error } = await supabase
    .from('invitations')
    .select('id, email, created_at, accepted_at')
    .order('created_at', { ascending: false })
    .limit(20);

  // Surface query errors loudly; admins want to know if their audit log is
  // broken rather than silently rendering an empty list.
  if (error) {
    throw error;
  }

  return (
    <AppShell>
      <PageHeader
        title="Invitasjoner"
        subtitle="Inviter spillere til Tørny"
        action={
          <BackLink href="/">Tilbake</BackLink>
        }
      />

      {status === 'sent' && (
        <div className="mb-4">
          <Banner tone="success">
            ✓ Invitasjon sendt til {sentEmail}.
          </Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card className="mb-6">
        <form action={sendInvitation} className="space-y-4">
          <Input
            id="email"
            name="email"
            type="email"
            label="E-postadresse"
            placeholder="spiller@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" className="w-full">
            Send invitasjon
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
          Tidligere invitasjoner
        </h2>
        {invitations && invitations.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {invitations.map((inv) => (
              <li key={inv.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900 dark:text-zinc-100 truncate">
                    {inv.email}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {formatDate(inv.created_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                    inv.accepted_at
                      ? 'bg-green-100 text-green-800'
                      : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                  }`}
                >
                  {inv.accepted_at ? 'Akseptert' : 'Venter'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            Ingen invitasjoner sendt ennå.
          </p>
        )}
      </Card>
    </AppShell>
  );
}
