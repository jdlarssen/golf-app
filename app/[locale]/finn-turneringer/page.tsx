import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { LinkButton } from '@/components/ui/Button';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { PullQuote } from '@/components/ui/PullQuote';
import { PinFlag } from '@/components/icons/PinFlag';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { HomeDiscoverySection } from '../HomeDiscoverySection';

// getDiscoverableGames bruker admin-client (service role) ved request-tid.
// Under cacheComponents (#538) prerendres aldri uncachet IO, så ruta trenger
// ikke force-dynamic for å holdes ute av builden (samme som /spillformater).

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
    data.friendGames.length === 0 &&
    data.pendingRequests.length === 0;

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">FINN TURNERINGER</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      {isEmpty ? (
        <section className="mt-4 flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
            Finn turneringer
          </h1>
          <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
            Ingen åpne turneringer akkurat nå. Men du trenger ikke vente på en
            invitasjon for å spille.
          </p>
          <div className="mt-8 w-full max-w-[280px]">
            <LinkButton href="/opprett-spill" full>
              Fyr opp din egen turnering
            </LinkButton>
          </div>
          <PullQuote className="mt-8">
            En turnering er bare en god grunn til å samle gjengen.
          </PullQuote>
        </section>
      ) : (
        <>
          <PageHeader
            title="Finn turneringer"
            subtitle="Åpne turneringer du kan melde deg på eller be om å bli med i."
          />
          <HomeDiscoverySection data={data} />
        </>
      )}
    </AppShell>
  );
}
