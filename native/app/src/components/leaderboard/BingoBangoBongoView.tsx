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
import { BOARD_TEXT } from '../../lib/boardCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import type { BingoBangoBongoResult } from '../../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import { useTheme } from '../../theme';
import { ReactableRow, ReactionHint, ReactionPlate } from './RowReactions';
import { useReactionsContext } from './ReactionsProvider';
import { SettlementCard } from './SettlementCard';

export function BingoBangoBongoView({
  result,
  settlement,
  nameOf,
}: {
  result: BingoBangoBongoResult;
  /** Pengeoppgjøret (#2221), eller null når spillet ikke har kroner per poeng. */
  settlement: Settlement | null;
  nameOf: (userId: string) => string;
}) {
  const { colors, ui } = useTheme();
  const selectedId = useReactionsContext()?.target?.userId;
  const anyPoints = result.players.some((player) => player.totalPoints > 0);

  return (
    <View testID="bbb-view">
      {result.players.map((player) => (
        <ReactableRow
          key={player.userId}
          target={{ userId: player.userId, name: nameOf(player.userId) }}
          label={[
            formatMessage(BOARD_TEXT.srPlace, { rank: player.rank }),
            nameOf(player.userId),
            `${player.bingos} bingo, ${player.bangos} bango, ${player.bongos} bongo`,
            formatMessage(BOARD_TEXT.srPoints, { total: player.totalPoints }),
          ].join(', ')}
          style={[
            ui.card,
            styles.row,
            player.rank === 1 ? { borderColor: colors.accent } : null,
            selectedId === player.userId ? { backgroundColor: colors.primarySoft } : null,
          ]}
          testID={`bbb-player-${player.userId}`}
        >
          <Text style={[ui.value, ui.num, styles.rank, { color: colors.muted }]}>
            {player.rank}
          </Text>
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
            <View style={styles.plate}>
              <ReactionPlate userId={player.userId} />
            </View>
          </View>
          <Text
            style={[ui.value, ui.num]}
            testID={`bbb-player-${player.userId}-points`}
          >
            {player.totalPoints}
          </Text>
        </ReactableRow>
      ))}
      <ReactionHint />

      {!anyPoints ? (
        <Text style={ui.muted} testID="bbb-no-points">
          Ingen prestasjoner er registrert ennå.
        </Text>
      ) : null}

      {settlement ? <SettlementCard settlement={settlement} nameOf={nameOf} /> : null}

      <Text style={ui.muted}>
        Bingo = først på green · Bango = nærmest hullet · Bongo = først i hull.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { minWidth: 28, textAlign: 'center' },
  detail: { flex: 1, gap: 2 },
  plate: { alignItems: 'flex-start' },
});
