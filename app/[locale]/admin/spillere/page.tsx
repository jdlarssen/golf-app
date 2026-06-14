import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
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
  name?: string | string[];
  error?: string | string[];
  q?: string | string[];
}>;

const getCounts = cache(async () => {
  const supabase = await getServerClient();
  // userCount counts fully-onboarded players only (profile_completed_at NOT NULL)
  // to match what PlayersList shows; otherwise pending-invitee trigger rows
  // would inflate the count.
  const [usersRes, pendingRes] = await Promise.all([
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('profile_completed_at', 'is', null),
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
  // Self-gate: prepares for Fase 4 chunk 2 lifting the layout-level admin
  // restriction. Trusted creators (Baner-tile users) redirect to /admin;
  // ikke-trusted-ikke-admin to /. Currently redundant with the layout-gate
  // but the layout-gate goes away in chunk 2.
  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const t = await getTranslations('admin.players');
  const tNav = await getTranslations('admin.nav');

  const params = await searchParams;
  const status = first(params.status);
  const email = first(params.email) ?? '';
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;
  const successMessage = status
    ? t(`success.${status}` as Parameters<typeof t>[0], { email, name })
    : undefined;
  const searchQuery = first(params.q) ?? '';

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={tNav('klubbhus')} />

      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading')}
        </h1>
        <Suspense fallback={<Skeleton className="h-3 w-64" />}>
          <CountsLine />
        </Suspense>
      </div>

      {(successMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {successMessage && (
            <Banner tone="success" testId="success-banner">
              {successMessage}
            </Banner>
          )}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>{t('sectionRegistered')}</MiniRibbon>
        <Suspense fallback={<ListSkeleton rows={4} />}>
          <PlayersList searchQuery={searchQuery} />
        </Suspense>
      </section>

      <section className="mt-5">
        <MiniRibbon>{t('sectionPending')}</MiniRibbon>
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
  const t = await getTranslations('admin.players');
  const { userCount, pendingCount } = await getCounts();
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {t('countRegistered', { count: userCount })}
      {pendingCount > 0 && ` ${t('countPending', { count: pendingCount })}`}
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
