// #2283: radene for sidekonkurransen på hullskjermen (`Sidekonk-hullet` H1 på
// designlerretet): nærmest pinnen, lengste drive og GIR, i den rekkefølgen, med
// 8 pt mellom når hullet har flere (G5, eierens valg «A, to rader»).
//
// Hvilke hull som er konkurransehull, er den delte regelen
// (`contestsForHole`): spillets egne plasser, eller cupens sidepoeng. Begge
// følger med i den bufrede bundelen, så radene står også uten nett.
//
// Radene vises bare når rpc-ene ville tatt imot en innmelding: runden pågår,
// og du har en flightnøkkel (`sideClaimFlightKey`, samme regel som
// `side_claim_flight_key`). En trukket spiller, eller en spiller uten flight i
// et spill med flere enn fire, får ingen rad.
import { StyleSheet, View } from 'react-native';
import {
  contestsForHole,
  girBallsForGame,
  sideClaimFlightKey,
  type HoleContest,
  type SideContestCategory,
} from '../../../../../lib/games/sideContest';
import { nameInitials } from '../../../../../lib/names/initials';
import { isAlternateShotMatchplay, type GameMode } from '../../../../../lib/scoring/modes/types';
import type { GameBundle } from '../../data/gameBundle';
import { displayName, formatNameList, shortDisplayName } from '../../lib/display';
import type { RosterEntry } from '../../lib/roster';
import { SIDE_CONTEST_TEXT } from '../../lib/sideContestCopy';
import { useSideClaims } from '../../lib/useSideClaims';
import { GirContestCard, type GirBallLine } from './GirContestCard';
import { SideContestCard, type ContestPlayer } from './SideContestCard';

export function HoleSideContests({
  gameId,
  holeNumber,
  userId,
  bundle,
  roster,
  flight,
  par,
  online,
}: {
  gameId: string;
  holeNumber: number;
  userId: string;
  bundle: GameBundle;
  roster: readonly RosterEntry[];
  /** De aktive i flighten (`resolveFlight`). */
  flight: readonly RosterEntry[];
  par: number;
  online: boolean;
}) {
  const mode = bundle.game.gameMode as GameMode;
  const flightKey = sideClaimFlightKey(mode, roster, userId);
  const contests =
    bundle.game.status === 'active' && flightKey != null
      ? contestsForHole(
          {
            sideLdCount: bundle.game.sideLdCount,
            sideCtpCount: bundle.game.sideCtpCount,
            sideLdHoles: bundle.game.sideLdHoles,
            sideCtpHoles: bundle.game.sideCtpHoles,
            sourceGameId: bundle.game.sourceGameId,
          },
          bundle.cupSideAwards,
          holeNumber,
        )
      : [];
  const hasSide = contests.some((c) => c.category !== 'gir');
  const gir = contests.find((c): c is HoleContest & { category: 'gir' } => c.category === 'gir');
  const claims = useSideClaims(gameId, holeNumber, { side: hasSide, gir: gir != null });

  if (contests.length === 0) return null;

  const nameOf = (id: string) => {
    if (id === userId) return SIDE_CONTEST_TEXT.you;
    const player = bundle.players.find((p) => p.userId === id);
    return player ? shortDisplayName(player) : null;
  };
  const players: ContestPlayer[] = flight.map((entry) => {
    const me = entry.user_id === userId;
    return {
      userId: entry.user_id,
      label: me ? SIDE_CONTEST_TEXT.you : displayName(entry.player),
      shortLabel: me ? SIDE_CONTEST_TEXT.you : shortDisplayName(entry.player),
      initials: nameInitials(displayName(entry.player)),
    };
  });
  const balls: GirBallLine[] = girBallsForGame(
    mode,
    flight.map((entry) => ({ userId: entry.user_id, teamNumber: entry.player.teamNumber })),
  ).flatMap((ball) => {
    const members = players.filter((p) => ball.userIds.includes(p.userId));
    if (members.length === 0) return [];
    return {
      key: ball.key,
      userIds: ball.userIds,
      // En foursomes-side: «Deg og Marte». En spiller: fullt navn.
      label: members.length > 1 ? formatNameList(members.map((m) => m.shortLabel)) : members[0].label,
      faces: members.map((m) => ({ initials: m.initials })),
    };
  });

  return (
    <View style={styles.rows} testID="side-contests">
      {contests.map((contest) =>
        contest.category === 'gir' ? (
          <GirContestCard
            key={`gir-${holeNumber}`}
            gameId={gameId}
            holeNumber={holeNumber}
            par={par}
            contest={contest}
            balls={balls}
            oneBallPerSide={isAlternateShotMatchplay(mode)}
            meId={userId}
            claims={claims.gir}
            failed={claims.failed}
            online={online}
            savedByName={nameOf}
            refresh={claims.refresh}
            snapshotSeq={claims.snapshotSeq}
            startedSeq={claims.startedSeq}
          />
        ) : (
          <SideContestCard
            key={`${contest.category}-${holeNumber}`}
            gameId={gameId}
            holeNumber={holeNumber}
            contest={contest as HoleContest & { category: SideContestCategory }}
            players={players}
            meId={userId}
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
    </View>
  );
}

const styles = StyleSheet.create({
  // H1: under hullhodet med samme luft som formatbannerne; flighthodet under
  // har sine egne 12 pt.
  rows: { marginTop: 10, gap: 8 },
});
