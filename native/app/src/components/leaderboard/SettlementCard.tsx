// Native (#2221): pengeoppgjøret på resultatskjermen.
//
// Samme kort som nettsidens `SettlementTable`: netto per spiller, og under en
// hårstrek hvem som betaler hvem. Tallene kommer ferdige fra den DELTE
// `settlementForResult` (`lib/scoring/settlement.ts`), så appen og nettsiden
// kan ikke vise ulike beløp. Her sorteres ingenting om — rekkefølgen er
// motorens (vinner først).
//
// Grønt for pluss, rødt for minus. Champagne (`accent`) brukes ikke: den er
// reservert for vinnere.
import { StyleSheet, Text, View } from 'react-native';
import { formatKr } from '../../../../../lib/format/formatKr';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import { SETTLEMENT_TEXT } from '../../lib/settlementCopy';
import { fillCopy } from '../../lib/sideTournamentCopy';
import { FONTS, useTheme } from '../../theme';

export function SettlementCard({
  settlement,
  nameOf,
}: {
  settlement: Settlement;
  nameOf: (userId: string) => string;
}) {
  const { colors, ui } = useTheme();

  return (
    <View style={ui.card} testID="settlement">
      <View style={styles.head}>
        <Text style={ui.body}>{SETTLEMENT_TEXT.title}</Text>
        <Text style={[ui.muted, ui.num]} testID="settlement-stake">
          {fillCopy(SETTLEMENT_TEXT.stake, {
            kr: settlement.krPerUnit,
            unit: settlement.unitLabel,
          })}
        </Text>
      </View>

      {settlement.perPlayer.map((line) => (
        <View
          key={line.userId}
          style={styles.row}
          testID={`settlement-player-${line.userId}`}
        >
          <Text style={[ui.body, styles.name]}>{nameOf(line.userId)}</Text>
          <Text
            style={[
              ui.body,
              ui.num,
              styles.amount,
              {
                fontFamily: FONTS.sansSemiBold,
                color:
                  line.netKr > 0
                    ? colors.primary
                    : line.netKr < 0
                      ? colors.danger
                      : colors.muted,
              },
            ]}
            testID={`settlement-player-${line.userId}-net`}
          >
            {`${line.netKr > 0 ? '+' : ''}${formatKr(line.netKr)}`}
          </Text>
        </View>
      ))}

      {/* Som på nettsiden: hårstreken skiller betalingene fra nettolista, og
          står ikke over «ingen penger skifter hender». */}
      {settlement.payments.length === 0 ? (
        <Text style={ui.muted} testID="settlement-empty">
          {SETTLEMENT_TEXT.empty}
        </Text>
      ) : (
        <View style={[styles.payments, { borderTopColor: colors.border }]}>
          {settlement.payments.map((payment, i) => (
            <View
              key={`${payment.fromUserId}-${payment.toUserId}-${i}`}
              style={styles.row}
              testID={`settlement-payment-${i}`}
            >
              <Text style={[ui.muted, styles.name]} testID={`settlement-payment-${i}-line`}>
                {fillCopy(SETTLEMENT_TEXT.owes, {
                  from: nameOf(payment.fromUserId),
                  to: nameOf(payment.toUserId),
                })}
              </Text>
              <Text
                style={[ui.body, ui.num, styles.amount]}
                testID={`settlement-payment-${i}-kr`}
              >
                {formatKr(payment.kr)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Et langt navn bryter over flere linjer i stedet for å kuttes; beløpet
  // krymper aldri.
  name: { flex: 1 },
  amount: { flexShrink: 0 },
  payments: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    gap: 8,
  },
});
