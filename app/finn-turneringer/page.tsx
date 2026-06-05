import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { HomeDiscoverySection } from '../HomeDiscoverySection';

// Dynamic: getDiscoverableGames bruker admin-client (service role) ved
// request-tid; statisk pre-render ville feilet uten env (samme som /spillformer).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Finn turneringer',
};

/**
 * Vedvarende «Finn turneringer»-side (#357). Nådd via et kort på Hjem, så
 * spillere som alt har spill fortsatt kan oppdage nye — ikke bare i tom-
 * tilstand. Viser open + manual_approval (påmeldingsmåten ER synligheten);
 * invite_only ekskluderes allerede i `getDiscoverableGames`.
 */
export default async function FinnTurneringerPage() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login?next=/finn-turneringer');
  }

  const data = await getDiscoverableGames(userId);
  const isEmpty =
    data.clubGames.length === 0 &&
    data.openGames.length === 0 &&
    data.pendingRequests.length === 0;

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">FINN TURNERINGER</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title="Finn turneringer"
        subtitle="Åpne turneringer du kan melde deg på eller be om å bli med i."
      />

      {isEmpty ? (
        <p className="mt-6 font-sans text-sm leading-relaxed text-muted">
          Ingen åpne turneringer akkurat nå. Be en arrangør om en invitasjon,
          eller stikk innom igjen senere.
        </p>
      ) : (
        <HomeDiscoverySection data={data} />
      )}
    </AppShell>
  );
}
