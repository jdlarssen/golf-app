import { TerminDayGroups } from '@/components/games/TerminDayGroups';
import {
  buildTerminEntries,
  groupTerminByDate,
  type GameSeats,
} from '@/lib/games/terminliste';
import type { DiscoverableOpenGame } from '@/lib/games/getDiscoverableGames';

/**
 * Anonym variant av funn-lista (#1185), som terminliste-dager siden #2258. En
 * uinnlogget besøkende ser åpne turneringer delt i dager — hver rad lenker til
 * den offentlige plakaten `/signup/[shortId]`, som selv håndterer login-runden.
 * Ingen påmeldings-knapper (de krever auth) og ingen navn eller påmeldt-tall
 * (#1193): raden viser spill-metadata, banenavn og plass-linja, som er et tall.
 *
 * Brukes på /finn-turneringer (uinnlogget) og forsiden (`AnonLanding`).
 * `headingLevel` følger flaten: dagene står under en h2 begge steder.
 */
export function AnonDiscoverySection({
  games,
  seats,
  now,
}: {
  games: DiscoverableOpenGame[];
  seats: ReadonlyMap<string, GameSeats>;
  now: Date;
}) {
  const groups = groupTerminByDate(buildTerminEntries({ openGames: games }, seats), now);

  return (
    <div className="leading-[normal]" data-testid="anon-discovery-list">
      <TerminDayGroups groups={groups} variant="anon" now={now} headingLevel="h3" />
    </div>
  );
}
