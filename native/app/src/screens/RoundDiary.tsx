// #2265: Rundedagboka — historikken i appen, identisk med designlerretet
// (`Historikk-forslag`, eierens retning 29.09 og 30.09).
//
// Fra toppen: den felles toppen med «HISTORIKK» (navigatoren,
// `kickerHeader`), «Rundedagboka» stort med «16 runder i 2026» under (siste
// sesong med runder), formkortet («Formen din»), og dagboka måned for måned.
// Etter siste måned fører «Se all statistikk» til statistikken (`RoundStats`),
// som eieren valgte i stedet for faner (svar 1, 01.10).
//
// Alt regnes fra runde-lista (`useRoundHistory`), den samme bag-taggen leser,
// så runder og beste runde i formkortet er de samme tallene som flisene på
// profilen. Lagball-runder står som «lag» og er ute av egne slagtall.
//
// Mens lista lastes, står tittelen og formkortets ramme med tomme tall (ingen
// spinner). Uten nett står en feillinje med «Prøv igjen». Uten ferdige runder
// står webbens tomtekst.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FormCard } from '../components/history/FormCard';
import { HistoryTitle } from '../components/history/HistoryTitle';
import { RoundDiaryList } from '../components/history/RoundDiaryList';
import { SettingList, SettingRow } from '../components/SettingRow';
import { HISTORY_TEXT, seasonLine } from '../lib/historyCopy';
import { groupDiaryByMonth } from '../lib/roundDiary';
import { formSeries, historyStats } from '../lib/roundHistory';
import { useDiaryPoints, useRoundHistory } from '../lib/useRoundHistory';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { useTheme } from '../theme';

export function RoundDiary({ navigation }: ScreenProps<'RoundDiary'>) {
  const { userId } = useSession();
  const { colors, ui } = useTheme();
  const { load, retry } = useRoundHistory(userId);
  const rounds = load.state === 'ready' ? load.rounds : null;
  const points = useDiaryPoints(rounds, userId);

  const view = useMemo(() => {
    if (!rounds) return null;
    const stats = historyStats(rounds, new Date());
    return {
      stats,
      series: formSeries(rounds),
      months: groupDiaryByMonth(rounds),
    };
  }, [rounds]);

  const season = view?.stats.season ?? null;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg }]}
      testID="round-diary-screen"
    >
      <HistoryTitle
        title={HISTORY_TEXT.title}
        subtitle={season ? seasonLine(season.rounds, season.year) : load.state === 'loading' ? ' ' : undefined}
        subtitleTestID="round-diary-subtitle"
      />

      {load.state === 'failed' ? (
        <View style={styles.inset}>
          <Text style={ui.error} testID="round-diary-error">
            {HISTORY_TEXT.loadFailed}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={ui.buttonSecondary}
            onPress={retry}
            testID="round-diary-retry"
          >
            <Text style={ui.buttonSecondaryText}>{HISTORY_TEXT.retry}</Text>
          </Pressable>
        </View>
      ) : view && view.months.length === 0 ? (
        <View style={[ui.card, styles.empty]}>
          <Text style={ui.muted} testID="round-diary-empty">
            {HISTORY_TEXT.emptyState}
          </Text>
        </View>
      ) : (
        <>
          <FormCard
            series={view?.series ?? null}
            season={season}
            seasonAverage={view?.stats.seasonAverage ?? null}
          />
          {view ? (
            <>
              <RoundDiaryList
                months={view.months}
                currentYear={season?.year ?? null}
                points={points}
                onOpenRound={(gameId) => navigation.navigate('Leaderboard', { gameId })}
              />
              <SettingList style={styles.statsLink} testID="round-diary-stats">
                <SettingRow
                  label={HISTORY_TEXT.seeAllStats}
                  chevron
                  onPress={() => navigation.navigate('RoundStats')}
                  testID="round-diary-see-stats"
                />
              </SettingList>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 32 },
  inset: { paddingHorizontal: 20, marginTop: 14, gap: 8 },
  empty: { marginHorizontal: 16, marginTop: 14 },
  statsLink: { marginHorizontal: 16, marginTop: 16 },
});
