'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { subscribeRealtimeChannel } from '@/lib/sync/realtimeChannel';

type Props = {
  /**
   * Spillet å lytte på. Utelates fra de delte chrome-flatene
   * (`LeaderboardShell`) som ikke får spill-ID som prop — da leses den fra
   * URL-en (`/games/[id]/...`). Per-hull-siden sender den eksplisitt siden
   * den allerede har den server-side.
   */
  gameId?: string;
  /**
   * Når `false` settes ingen WebSocket-abonnent opp. Per-hull-siden gater på
   * `game.status === 'active'`; de delte chrome-flatene lar den stå `true`
   * (default) — et avsluttet spill produserer ingen `scores`-INSERT, så
   * abonnementet er inert der.
   */
  active?: boolean;
};

/**
 * Plukker spill-ID-en ut av `/<locale>/games/<id>/leaderboard...`. Brukes når
 * shellen ikke får ID-en som prop. Leses fra `window.location` (ikke
 * `useParams`) bevisst: de eksisterende format-visnings-testene mocker bare
 * `useRouter` på `next/navigation`, så en hook-avhengighet til ruten her ville
 * sprengt ~14 co-located tester uten å røre selve visningene.
 */
function gameIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/games\/([^/]+)/);
  return match ? match[1]! : null;
}

/**
 * Live-refresh for ALLE format-leaderboardene (#679). Montert én gang i den
 * delte `LeaderboardShell` (og per-hull-siden), så hver format-visning —
 * stableford, skins, wolf, nassau, … — arver auto-oppdatering uten å røre de
 * 19 visnings-filene.
 *
 * Abonnerer på `scores`-INSERT og `scores`-UPDATE for spillet. INSERT-en
 * tripper når en ny score registreres; UPDATE-en tripper når en score
 * korrigeres via `upsert_score_if_newer` (#745), slik at en tilskuers tall
 * aldri henger igjen etter en korrigering. Begge ruter gjennom den 300ms-
 * debouncede `scheduleRefresh` så en byge av INSERT-er (helt scorekort)
 * kollapser til én refresh.
 *
 * Følger samme mønster som `PreRoundLeaderboardRealtime`:
 * `subscribeRealtimeChannel` eier `setAuth`-quirken (WebSocket-transporten
 * plukker ikke opp cookie-sesjonen automatisk) og den lekk-resistente
 * oppryddingen. `scores` har REPLICA IDENTITY FULL (0006) og er i
 * realtime-publikasjonen (0005), så UPDATE-events er leverbare.
 */
export function LeaderboardRealtime({ gameId, active = true }: Props): null {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const resolvedGameId =
      gameId ?? gameIdFromPath(window.location.pathname);
    if (!resolvedGameId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const unsubscribe = subscribeRealtimeChannel(
      `leaderboard-live:${resolvedGameId}`,
      (channel) =>
        channel
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'scores',
              filter: `game_id=eq.${resolvedGameId}`,
            },
            scheduleRefresh,
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'scores',
              filter: `game_id=eq.${resolvedGameId}`,
            },
            scheduleRefresh,
          ),
    );

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [active, gameId, router]);

  return null;
}
