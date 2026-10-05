// #2265: statistikken bak Rundedagboka, åpnet med «Se all statistikk».
//
// Eieren valgte tegningen pluss en lenke i stedet for faner (svar 1, 01.10):
// Rundedagboka er dagboka, og alt webbens «Statistikk»-fane har, unntatt den
// gamle formkurven, står her. Toppen er den felles med «HISTORIKK», og
// «Statistikk» står stort i innholdet.
//
// Skjermen leser runde-lista selv (`useRoundHistory`), den samme som
// Rundedagboka og bag-taggen, og regner alt med `historyStats`. Uten nett står
// feillinja med «Prøv igjen».
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AchievementSection,
  CoursesSection,
  HandicapFormSection,
  MyStatsSection,
  PuttsSection,
  SeasonSection,
  StreakSection,
} from '../components/history/StatsSections';
import { HistoryTitle } from '../components/history/HistoryTitle';
import { HISTORY_TEXT } from '../lib/historyCopy';
import { historyStats } from '../lib/roundHistory';
import { useRoundHistory } from '../lib/useRoundHistory';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';
import { useMarkVisitRead } from '../lib/useMarkVisitRead';

export function RoundStats(_props: ScreenProps<'RoundStats'>) {
  const { userId } = useSession();
  // #2201: merkeveggen står her, så «Nye merker» er lest også her.
  useMarkVisitRead('history');
  const { colors, ui } = useTheme();
  const { load, retry } = useRoundHistory(userId);
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(
    () => (load.state === 'ready' ? historyStats(load.rounds, now) : null),
    [load, now],
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg }]}
      testID="round-stats-screen"
    >
      <HistoryTitle title={HISTORY_TEXT.statsTitle} />

      {load.state === 'failed' ? (
        <View style={styles.inset}>
          <Text style={ui.error} testID="round-stats-error">
            {HISTORY_TEXT.loadFailed}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={ui.buttonSecondary}
            onPress={retry}
            testID="round-stats-retry"
          >
            <Text style={ui.buttonSecondaryText}>{HISTORY_TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : stats && load.state === 'ready' && load.rounds.length === 0 ? (
        <View style={[ui.card, styles.empty]}>
          <Text style={ui.muted} testID="round-stats-empty">
            {HISTORY_TEXT.emptyState}
          </Text>
        </View>
      ) : stats ? (
        <>
          <MyStatsSection stats={stats.myStats} />
          <HandicapFormSection differentials={stats.differentials} />
          <SeasonSection seasons={stats.seasons} />
          <StreakSection streak={stats.streak} year={now.getFullYear()} />
          <AchievementSection achievements={stats.lifetimeAchievements} />
          <PuttsSection putts={stats.putts} />
          <CoursesSection courses={stats.courses} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 32 },
  inset: { paddingHorizontal: 20, marginTop: 14, gap: 8 },
  empty: { marginHorizontal: 16, marginTop: 14 },
});
