// #2638 Del 2: tilstandene ligaskjermene deler (tegning 5b og 6).
//
//  - `LeagueLoading`: mens ligaen hentes første gang.
//  - `LeagueLoadFailed`: ingen liga å vise. «Fikk ikke tak i ligaen …» med
//    «Prøv igjen», eller «Fant ikke ligaen …» uten knapp (finnes ikke, eller
//    ikke for deg).
//  - `LeagueNotice`: den gule boksen med i-en, avslagene på «Start runden».
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LeagueLoadFailure } from '../../data/league';
import { LEAGUE_TEXT, describeLeagueLoadFailure } from '../../lib/leagueCopy';
import { FONTS, TAP, interLine, useTheme, withAlpha } from '../../theme';
import { LigaInfoIcon } from '../icons/Icons';

export function LeagueLoading() {
  const { colors, ui } = useTheme();
  return (
    <View style={ui.centered} testID="league-loading">
      <ActivityIndicator color={colors.primary} />
      <Text style={ui.muted}>{LEAGUE_TEXT.loading}</Text>
    </View>
  );
}

export function LeagueLoadFailed({
  reason,
  retrying,
  onRetry,
}: {
  reason: LeagueLoadFailure;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const text = describeLeagueLoadFailure(reason);
  if (reason === 'not_found') {
    return (
      <View style={[styles.state, { backgroundColor: colors.bg }]} testID="league-not-found">
        <Text style={[styles.body, { color: colors.text }]}>{text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.state, { backgroundColor: colors.bg }]} testID="league-load-failed">
      <Text style={[styles.error, { color: colors.danger }]} testID="league-error">
        {text}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={[styles.retry, { borderColor: colors.primary }]}
        testID="league-retry"
      >
        <Text style={[styles.retryText, { color: colors.primary }]}>
          {retrying ? LEAGUE_TEXT.retrying : LEAGUE_TEXT.retry}
        </Text>
      </Pressable>
    </View>
  );
}

export function LeagueNotice({ text, testID }: { text: string; testID?: string }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.notice,
        {
          backgroundColor: colors.warningSoft,
          // Tegningenes `--warning-border`: blekket med 24 % i lys, 28 % i natt.
          borderColor: withAlpha(colors.warningText, scheme === 'dark' ? 0.28 : 0.24),
        },
      ]}
      accessibilityRole="alert"
      testID={testID}
    >
      <View style={styles.noticeIcon}>
        <LigaInfoIcon color={colors.warningText} />
      </View>
      <Text style={[styles.noticeText, { color: colors.warningText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // `.centered`: 12 og 24 inn, 12 mellom, øverst under toppen.
  state: { flex: 1, alignItems: 'center', gap: 12, paddingTop: 26, paddingHorizontal: 24 },
  error: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  body: { ...interLine(16, 23, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  // `.btn2`: minst 44 høy, 24 inn, 1 pt kant i primærfargen.
  retry: {
    minHeight: TAP,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  retryText: { ...interLine(16, 19), fontFamily: FONTS.sansSemiBold },
  // `.notice`: 12 og 14 inn, 12 i hjørnene, 10 mellom i-en og teksten.
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  noticeIcon: { marginTop: 1 },
  noticeText: { flex: 1, ...interLine(14, 20, { multiline: true }), fontFamily: FONTS.sans },
});
