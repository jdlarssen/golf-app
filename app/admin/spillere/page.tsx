import { Suspense, cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlayersList } from './_components/PlayersList';
import { PendingInvitations } from './_components/PendingInvitations';
import { InviteForm } from './_components/InviteForm';

type SearchParams = Promise<{
  status?: string | string[];
  email?: string | string[];
  error?: string | string[];
  q?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må fylle inn en e-postadresse.',
  rate_limited: 'Vent litt før du sender en ny invitasjon.',
  log_failed: 'Invitasjonen ble sendt, men loggføring feilet.',
  mail_failed: 'Mailen kom ikke ut. Sjekk Vercel-loggene for detaljer.',
  resend_failed: 'Klarte ikke sende invitasjonen på nytt. Prøv igjen.',
  withdraw_failed: 'Klarte ikke trekke tilbake invitasjonen. Prøv igjen.',
  not_admin: 'Du har ikke tilgang til denne handlingen.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

const SUCCESS_MESSAGES: Record<string, (email: string) => string> = {
  sent: (email: string) => `✓ Invitasjon sendt til ${email}.`,
  resent: (email: string) => `✓ Invitasjon sendt på nytt til ${email}.`,
  withdrawn: (email: string) =>
    `Invitasjonen til ${email} er trukket tilbake. E-posten er ledig igjen.`,
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const getCounts = cache(async () => {
  const supabase = await getServerClient();
  const [usersRes, pendingRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null),
  ]);
  return {
    userCount: usersRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
  };
});

export default async function SpillerePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const email = first(params.email) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const successBuilder = status ? SUCCESS_MESSAGES[status] : undefined;
  const successMessage = successBuilder ? successBuilder(email) : undefined;
  const searchQuery = first(params.q) ?? '';

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Spillere · klubblisten" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Spillere
        </h1>
        <Suspense fallback={<Skeleton className="h-3 w-64" />}>
          <CountsLine />
        </Suspense>
      </div>

      {(successMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {successMessage && <Banner tone="success">{successMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>Registrerte spillere</MiniRibbon>
        <Suspense fallback={<ListSkeleton rows={4} />}>
          <PlayersList searchQuery={searchQuery} />
        </Suspense>
      </section>

      <section className="mt-5">
        <MiniRibbon>Ventende invitasjoner</MiniRibbon>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <PendingInvitations />
        </Suspense>
      </section>

      <section className="mt-5">
        <InviteForm />
      </section>
    </AdminShell>
  );
}

async function CountsLine() {
  const { userCount, pendingCount } = await getCounts();
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {userCount} registrert
      {pendingCount > 0 && ` · ${pendingCount} venter`}
    </p>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 px-3.5 py-3"
          style={{
            borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
          }}
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-3/5" delay={i * 90} />
            <Skeleton className="mt-1 h-2.5 w-2/5" delay={i * 90 + 30} />
          </div>
          <Skeleton className="h-4 w-16 rounded-full" delay={i * 90 + 60} />
        </div>
      ))}
    </div>
  );
}
