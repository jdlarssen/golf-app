import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { PendingRequestCard } from '@/components/games/PendingRequestCard';
import {
  TerminCard,
  TerminDayGroups,
  TerminHeading,
} from '@/components/games/TerminDayGroups';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from '@/lib/games/getDiscoverableGames';
import type { GameSocialProof } from '@/lib/games/socialProof';
import {
  buildTerminEntries,
  groupTerminByDate,
  type GameSeats,
} from '@/lib/games/terminliste';
import { capDiscoveryPreview } from '@/lib/games/discoveryPreviewCap';

/**
 * «Funn turneringer»-seksjon på hjem-siden (#257). Vises når det faktisk
 * finnes innhold å vise.
 *
 * #2258 (anbefaling 5, godtatt): samme utseende som terminlista — egne
 * forespørsler øverst, så rundene delt i dager med samme rader og plass-linje.
 * Overskriftene «I dine klubber» / «Fra vennene dine» / «Åpne turneringer» er
 * borte; «Se alle» står.
 *
 * Caller (app/page.tsx) henter data via `getDiscoverableGames()` slik at
 * samme query kan styre BÅDE velkomst-teksten over og denne seksjonen —
 * uten å fyre lookup-en to ganger.
 */
export function HomeDiscoverySection({
  data,
  socialProof = {},
  seats,
  now,
  preview = false,
}: {
  data: {
    clubGames: DiscoverableClubGame[];
    openGames: DiscoverableOpenGame[];
    friendGames: DiscoverableFriendGame[];
    pendingRequests: PendingRequest[];
  };
  /**
   * #1193: sosialt bevis per rad, `gameId → GameSocialProof`. Kalleren
   * batcher ett roster- + ett venne-oppslag for hele lista. Spill uten treff
   * mangler bare fra kartet — raden rendrer da ingen linje.
   */
  socialProof?: Record<string, GameSocialProof>;
  /** #2258: seter per spill fra `getRegistrationSeats` (plass-linja, «Fullt»). */
  seats: ReadonlyMap<string, GameSeats>;
  /** Etter kallerens auth- og dataoppslag: dagsetikettene regnes fra nå. */
  now: Date;
  /**
   * Hjems fylt-tilstand-forhåndsvisning (#879, tak revidert i #1798): kapp de
   * passive listene til ett samlet totaltak på tvers av klubb/venner/åpne
   * (kuratert klubb > venner > åpne) og legg på en «Se alle»-hale til
   * /finn-turneringer. Radene sorteres på tid ETTER kappingen (#2258). Egne
   * ventende forespørsler er spillerens egen handling og kappes aldri.
   * Default (false) = fulle lister — brukes av Hjems tom-tilstand.
   */
  preview?: boolean;
}) {
  const t = useTranslations('discover');
  const { pendingRequests } = data;
  const listed = preview ? capDiscoveryPreview(data) : data;
  const groups = groupTerminByDate(buildTerminEntries(listed, seats), now);
  // «Se alle»-halen kobler på om det fantes NOEN passive funn (før kapping),
  // ikke på om noe ble kuttet.
  const hasPassiveDiscovery =
    data.clubGames.length > 0 ||
    data.friendGames.length > 0 ||
    data.openGames.length > 0;

  return (
    <section className={`w-full leading-[normal] ${preview ? '' : 'mt-10'}`}>
      {pendingRequests.length > 0 && (
        <section>
          <TerminHeading title={t('myRequests')} />
          <TerminCard>
            {pendingRequests.map((request) => (
              <PendingRequestCard key={request.id} request={request} />
            ))}
          </TerminCard>
        </section>
      )}

      {groups.length > 0 && (
        <TerminDayGroups
          groups={groups}
          variant="player"
          now={now}
          socialProof={socialProof}
          firstClassName={pendingRequests.length > 0 ? 'mt-5' : ''}
        />
      )}

      {/* #879: «Se alle»-hale til den fulle funn-siden når Hjem viser en kappet
          forhåndsvisning. Kun når det finnes passive funn å se mer av. */}
      {preview && hasPassiveDiscovery && (
        <SmartLink
          href="/finn-turneringer"
          className="mt-5 flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2"
        >
          <span className="font-sans text-sm font-medium text-text">
            {t('seeAllTournaments')}
          </span>
          <span aria-hidden className="text-muted">
            →
          </span>
        </SmartLink>
      )}
    </section>
  );
}
