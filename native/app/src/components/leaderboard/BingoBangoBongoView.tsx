// Native (#1832): Bingo Bango Bongo-visningen.
//
// Ett kort per spiller i stedet for én bred tabell: formatet har fire tall per
// spiller (bingo, bango, bongo og summen), og seks kolonner på en telefon gir
// avkuttede navn og brekte overskrifter. Kortet er samme oppdeling webben
// bruker — navn og fordeling til venstre, totalen stor til høyre.
//
// Poengene kommer fra prestasjonene, ikke fra slagene: en spiller kan lede
// lenge før noen har tastet et tall. Motoren har rangert radene; her sorteres
// ingenting om.
import { StyleSheet, Text, View } from 'react-native';
import type { BingoBangoBongoResult } from '../../../../../lib/scoring/modes/types';
import { COLORS, ui } from '../../theme';

export function BingoBangoBongoView({
  result,
  nameOf,
}: {
  result: BingoBangoBongoResult;
  nameOf: (userId: string) => string;
}) {
  const anyPoints = result.players.some((player) => player.totalPoints > 0);

  return (
    <View testID="bbb-view">
      {result.players.map((player) => (
        <View
          key={player.userId}
          style={[ui.card, styles.row, player.rank === 1 ? styles.leader : null]}
          testID={`bbb-player-${player.userId}`}
        >
          <Text style={[ui.value, ui.num, styles.rank]}>{player.rank}</Text>
          <View style={styles.detail}>
            <Text style={ui.body} numberOfLines={1}>
              {nameOf(player.userId)}
            </Text>
            <Text
              style={[ui.muted, ui.num]}
              testID={`bbb-player-${player.userId}-breakdown`}
            >
              {player.bingos} bingo · {player.bangos} bango · {player.bongos} bongo
            </Text>
          </View>
          <Text
            style={[ui.value, ui.num]}
            testID={`bbb-player-${player.userId}-points`}
          >
            {player.totalPoints}
          </Text>
        </View>
      ))}

      {!anyPoints ? (
        <Text style={ui.muted} testID="bbb-no-points">
          Ingen prestasjoner er registrert ennå.
        </Text>
      ) : null}

      <Text style={ui.muted}>
        Bingo = først på green · Bango = nærmest hullet · Bongo = først i hull.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { minWidth: 28, textAlign: 'center', color: COLORS.muted },
  detail: { flex: 1, gap: 2 },
  leader: { borderColor: COLORS.gold },
});
