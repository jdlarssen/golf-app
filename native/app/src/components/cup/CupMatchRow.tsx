// #2752: én kamp i cup-rommet. Lag eller navn, status, og en knapp inn når du får
// åpne kampen. Ruta spør RLS (`canOpen`): en spiller ser bare egne kamper, også i
// en ferdig cup (#1542), så de andre har ingen knapp som ville ført til «fant
// ikke spillet». Arrangøren og admin leser alle.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppCupMatch } from '../../../../../lib/cup/appCupView';
import { CUP_TEXT, matchOutcomeLine, matchScore, matchStatusLabel } from '../../lib/cupCopy';
import { formatMessage } from '../../lib/kavalkadeCopy';
import { FONTS, fraunces, TAP, interLine, useTheme } from '../../theme';
import { ChevronIcon } from '../icons/Icons';

export function CupMatchRow({ match, onOpen }: { match: AppCupMatch; onOpen: () => void }) {
  const { colors } = useTheme();
  const outcomeLine = matchOutcomeLine(match.outcome);
  const label = match.label ?? CUP_TEXT.matchFallback;
  const right = match.outcome ? matchScore(match.outcome) : matchStatusLabel(match);

  const body: ReactNode = (
    <>
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.names, { color: colors.text }]}>
          {match.side1} <Text style={[styles.mot, { color: colors.muted }]}>{CUP_TEXT.mot}</Text> {match.side2}
        </Text>
        {match.soloPartnerName ? (
          <Text style={[styles.sub, { color: colors.muted }]} testID={`cup-match-solo-${match.gameId}`}>
            {formatMessage(CUP_TEXT.matchSoloPlayOn, { partner: match.soloPartnerName })}
          </Text>
        ) : null}
        {outcomeLine ? (
          <Text style={[styles.sub, { color: colors.muted }]} testID={`cup-match-outcome-${match.gameId}`}>
            {outcomeLine}
          </Text>
        ) : null}
      </View>
      <Text
        style={[match.outcome ? styles.score : styles.status, { color: match.outcome ? colors.primary : colors.muted }]}
        testID={`cup-match-status-${match.gameId}`}
      >
        {right}
      </Text>
    </>
  );

  const rowStyle = [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }];
  if (!match.canOpen) {
    return (
      <View style={rowStyle} testID={`cup-match-${match.gameId}`}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={rowStyle}
      testID={`cup-match-${match.gameId}`}
    >
      {body}
      <ChevronIcon direction="right" color={colors.primary} size={16} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TAP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 12, fontFamily: FONTS.sansSemiBold },
  names: { ...fraunces(500, 15, 20, { multiline: true }) },
  mot: { fontSize: 12, fontFamily: FONTS.sans },
  sub: { ...interLine(12, 16, { multiline: true }), fontFamily: FONTS.sans },
  status: { flexShrink: 1, maxWidth: 130, textAlign: 'right', fontSize: 12, fontFamily: FONTS.sans },
  score: { ...fraunces(500, 18) },
});
