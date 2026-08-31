// Native (#1832): Wolf-visningen.
//
// To seksjoner, samme rekkefølge som på web: hvem som leder pakken, og
// deretter hvordan poengene ble delt ut hull for hull.
//
// Ingen egen poengformel her. `totalPoints`, `stake` og `outcome` kommer
// ferdig fra motoren; dette laget setter norske ord på dem via
// `leaderboardModel` — som i sin tur klassifiserer via den DELTE
// `lib/wolf/holeLabels`, samme kilde webben bruker.
import { StyleSheet, Text, View } from 'react-native';
import type { WolfResult } from '../../../../../lib/scoring/modes/types';
import {
  wolfChoiceLabel,
  wolfHolePointsLine,
  wolfHolesWithStory,
  wolfOutcomeLabel,
} from '../../lib/leaderboardModel';
import { ui } from '../../theme';
import { LeaderTable } from './Table';

export function WolfView({
  result,
  nameOf,
}: {
  result: WolfResult;
  nameOf: (userId: string) => string;
}) {
  const holes = wolfHolesWithStory(result.holes);
  const blindWolves = result.players.filter((player) => player.blindWolfWins > 0);

  return (
    <View testID="wolf-view">
      <LeaderTable
        testID="leaderboard-table"
        columns={[
          { key: 'rank', label: '#', flex: 0.5, numeric: true },
          { key: 'name', label: 'Navn', flex: 3 },
          { key: 'points', label: 'Poeng', numeric: true },
          { key: 'wolfHoles', label: 'Wolf', numeric: true },
        ]}
        rows={result.players.map((player) => ({
          key: player.userId,
          highlight: player.rank === 1,
          cells: [
            player.rank,
            nameOf(player.userId),
            player.totalPoints,
            player.wolfHolesPlayed,
          ],
        }))}
      />
      <Text style={ui.muted}>Wolf = hull der spilleren selv var Wolf.</Text>

      {blindWolves.length > 0 ? (
        <Text style={ui.muted} testID="wolf-blind-pots">
          Blind Wolf-potter:{' '}
          {blindWolves
            .map((player) => `${nameOf(player.userId)} ${player.blindWolfWins}`)
            .join(' · ')}
        </Text>
      ) : null}

      <Text style={ui.sectionTitle}>Hull for hull</Text>
      {holes.length === 0 ? (
        <Text style={ui.muted} testID="wolf-holes-empty">
          Listen fylles etter hvert som wolfen velger.
        </Text>
      ) : (
        holes.map((hole) => {
          const pointsLine = wolfHolePointsLine(hole.pointsByPlayer, nameOf);
          return (
            <View
              key={hole.holeNumber}
              style={ui.card}
              testID={`wolf-hole-${hole.holeNumber}`}
            >
              <View style={styles.holeHead}>
                <Text style={[ui.body, ui.num]}>
                  Hull {hole.holeNumber} · par {hole.par}
                </Text>
                {/* Stake står bare når den faktisk har vokst: «1×» på hvert
                    hull ville vært støy, en 3× er det spillerne snakker om. */}
                {hole.stake > 1 ? (
                  <View style={ui.badge}>
                    <Text style={[ui.badgeText, ui.num]}>{hole.stake}×</Text>
                  </View>
                ) : null}
              </View>
              <Text style={ui.muted} testID={`wolf-hole-${hole.holeNumber}-line`}>
                {`Wolf: ${nameOf(hole.wolfUserId)} · ${wolfChoiceLabel(
                  hole.choice,
                  hole.partnerUserId,
                  nameOf,
                )} · ${wolfOutcomeLabel(hole.outcome)}`}
              </Text>
              {pointsLine ? (
                <Text
                  style={[ui.muted, ui.num]}
                  testID={`wolf-hole-${hole.holeNumber}-points`}
                >
                  {pointsLine}
                </Text>
              ) : null}
            </View>
          );
        })
      )}

      <Text style={ui.muted}>
        {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  holeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
