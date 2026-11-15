'use client';

// #2283 (part D3): the side-contest rows on the hole page (`Sidekonk-hullet` H2
// on the design canvas): closest to pin, longest drive and GIR, in that order,
// 8 px apart when the hole has more than one (G5, the owner's choice «A, to
// rader»). The same rows as the app's `HoleSideContests`.
//
// Which holes are contest holes is the shared rule (`contestsForHole`), worked
// out on the server (`holeSideContest.ts`) and handed over as
// `HoleClientProps.sideContest`. The rows show only when the rpcs would accept
// a report (`canReport`): the round is running and I am an active player with a
// flight key (`sideClaimFlightKey`). A withdrawn player, or one without a
// flight in a game of more than four, gets no row.
import { useOnline } from '@/hooks/useOnline';
import { claimsNeeded } from '@/lib/games/sideClaims';
import { girBallsForGame, type HoleContest, type SideContestCategory } from '@/lib/games/sideContest';
import { isAlternateShotMatchplay, type GameMode } from '@/lib/scoring/modes/types';
import type { HoleSideContestProps } from './holeClientProps';
import { GirContestEntry, type GirBallLine } from './GirContestEntry';
import { SideContestEntry, type ContestPlayer } from './SideContestEntry';
import { useSideClaims } from './useSideClaims';
import { useSideContestText } from './sideContestText';

export function HoleSideContests({
  gameId,
  holeNumber,
  gameMode,
  par,
  myUserId,
  sideContest,
}: {
  gameId: string;
  holeNumber: number;
  gameMode: GameMode;
  par: number;
  myUserId: string;
  sideContest: HoleSideContestProps;
}) {
  const text = useSideContestText();
  const online = useOnline();
  const { contests, players: flight, claims: snapshot } = sideContest;
  const claims = useSideClaims(gameId, holeNumber, claimsNeeded(contests), snapshot);

  if (contests.length === 0) return null;

  // Names the winners and `entered_by`, withdrawn players included.
  const nameOf = (userId: string): string | null => {
    if (userId === myUserId) return text.you;
    return flight.find((p) => p.userId === userId)?.shortName ?? null;
  };
  // The lines: only the players still in the round (`resolveFlight`'s rule).
  const players: ContestPlayer[] = flight
    .filter((p) => !p.withdrawn)
    .map((p) => {
      const me = p.userId === myUserId;
      return {
        userId: p.userId,
        label: me ? text.you : p.name,
        shortLabel: me ? text.you : p.shortName,
        initials: p.initial,
      };
    });
  const balls: GirBallLine[] = girBallsForGame(
    gameMode,
    flight.filter((p) => !p.withdrawn).map((p) => ({ userId: p.userId, teamNumber: p.teamNumber })),
  ).flatMap((ball) => {
    const members = players.filter((p) => ball.userIds.includes(p.userId));
    if (members.length === 0) return [];
    return {
      key: ball.key,
      userIds: ball.userIds,
      // A foursomes side: «Deg og Marte». One player: the full name.
      label: members.length > 1 ? text.nameList(members.map((m) => m.shortLabel)) : members[0].label,
      faces: members.map((m) => ({ initials: m.initials })),
    };
  });

  return (
    <div className="flex flex-col gap-2" data-testid="side-contests">
      {contests.map((contest) =>
        contest.category === 'gir' ? (
          <GirContestEntry
            key={`gir-${holeNumber}`}
            gameId={gameId}
            holeNumber={holeNumber}
            par={par}
            contest={contest}
            balls={balls}
            oneBallPerSide={isAlternateShotMatchplay(gameMode)}
            meId={myUserId}
            claims={claims.gir}
            failed={claims.failed}
            online={online}
            savedByName={nameOf}
            refresh={claims.refresh}
            snapshotSeq={claims.snapshotSeq}
            startedSeq={claims.startedSeq}
          />
        ) : (
          <SideContestEntry
            key={`${contest.category}-${holeNumber}`}
            gameId={gameId}
            holeNumber={holeNumber}
            contest={contest as HoleContest & { category: SideContestCategory }}
            players={players}
            meId={myUserId}
            claim={
              claims.side === undefined
                ? undefined
                : (claims.side.find((c) => c.category === contest.category) ?? null)
            }
            failed={claims.failed}
            online={online}
            savedByName={nameOf}
            refresh={claims.refresh}
            snapshotSeq={claims.snapshotSeq}
            startedSeq={claims.startedSeq}
          />
        ),
      )}
    </div>
  );
}
