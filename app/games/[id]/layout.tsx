import { RealtimeMount } from './RealtimeMount';
import { SyncBanner } from '@/components/sync/SyncBanner';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';

type Params = Promise<{ id: string }>;

export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { id } = await params;
  // Gate the realtime subscription on game-lifecycle: draft and scheduled
  // games have no scores yet, so the websocket subscription is pure idle
  // overhead on the waiting-room screen. ScheduledWaitingRoom owns its own
  // narrow subscription on `games.status` that triggers router.refresh()
  // when admin starts the round — that re-runs this layout, sees status
  // flipped to 'active', and mounts RealtimeMount for the live round.
  //
  // Read through the same tag-cached helper the children use (hull-page,
  // leaderboard, etc.) so this layout adds zero network round-trips.
  const gwp = await getGameWithPlayers(id);
  const playable =
    gwp?.game.status === 'active' || gwp?.game.status === 'finished';
  return (
    <>
      {playable && <RealtimeMount gameId={id} />}
      <SyncBanner />
      {children}
    </>
  );
}
