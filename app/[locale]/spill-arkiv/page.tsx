import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getFinishedGamesForUser } from '@/lib/games/getFinishedGamesForUser';
import { groupFinishedByMonth } from '@/lib/games/groupFinishedByMonth';
import { FinishedGameCard } from '@/components/games/FinishedGameCard';

export const metadata: Metadata = {
  title: 'Avsluttede spill',
};

/**
 * Spill-arkiv (#571): hele historikken av avsluttede spill, gruppert per måned
 * (nyeste først). Hjem viser bare de siste 5 + en «Vis alle»-lenke hit, så
 * hjem-siden holder seg som play + discover-navet og ikke vokser uten grense.
 *
 * Auth-gates som resten av app-en (leser cookies/headers → ruta er dynamisk
 * under cacheComponents, så ingen force-dynamic trengs — samme som Hjem).
 */
export default async function SpillArkivPage() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login?next=/spill-arkiv');
  }

  const supabase = await getServerClient();
  const finishedGames = await getFinishedGamesForUser(supabase, userId);
  const groups = groupFinishedByMonth(finishedGames);

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">SPILL-ARKIV</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title="Avsluttede spill"
        subtitle={
          finishedGames.length > 0 ? 'Alle rundene dine, nyeste først.' : undefined
        }
      />

      {groups.length === 0 ? (
        <p className="mt-4 font-sans text-sm leading-relaxed text-muted">
          Du har ingen avsluttede spill enda. Når en runde er ferdigspilt, havner
          den her.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {group.label}
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
                {group.games.map((g) => (
                  <FinishedGameCard key={g.id} game={g} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
