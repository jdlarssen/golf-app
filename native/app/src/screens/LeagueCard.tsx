// #2815: kortet bak et resultat i sesongtabellen — webbens /liga/[id]/kort/….
//
// En ligakamerat står som regel ikke i flighten, så kortet kan ikke leses fra
// Supabase (RLS viser et ferdig spill bare til spillerne, #1542). Det kommer
// fra serveren (`data/leagueCard.ts`), bak porten `leagueCardAccess`: den som
// får se ligaen, får se et kort som teller i tabellen.
//
// Bare til lesing. Kortet er det klassiske scorekortet fra markørens skjerm,
// UT og INN med PAR og SLAG, og i tillegg NETTO (slagspill) eller POENG
// (stableford) per hull. Serveren har regnet alt: tallene, summene og
// resultatet, som er tallet i tabellens celle. Appen tegner det bare.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LeagueCardResponse } from '../../../../lib/league/appLeagueView';
import { kickerHeader } from '../components/KickerHeader';
import { ScorecardGrid, type ScorecardRowKind } from '../components/scorecard/ScorecardGrid';
import { ScorecardTotals } from '../components/scorecard/ScorecardTotals';
import { fetchLeagueCard } from '../data/leagueCard';
import {
  LEAGUE_CARD_TEXT,
  isPointsBased,
  leagueCardHeading,
  leagueCardResultLine,
  leagueCardSubtitle,
} from '../lib/leagueCopy';
import type { ScreenProps } from '../navigation';
import { FONTS, fraunces, interLine, useTheme } from '../theme';

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; card: LeagueCardResponse };

export function LeagueCard({ route, navigation }: ScreenProps<'LeagueCard'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { leagueId, gameId, userId } = route.params;

  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const reload = useCallback(async () => {
    const result = await fetchLeagueCard(leagueId, gameId, userId);
    setLoad(result.ok ? { status: 'ready', card: result.card } : { status: 'failed' });
  }, [leagueId, gameId, userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchLeagueCard(leagueId, gameId, userId);
      if (!cancelled) setLoad(result.ok ? { status: 'ready', card: result.card } : { status: 'failed' });
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, gameId, userId]);

  const card = load.status === 'ready' ? load.card : null;
  useLayoutEffect(() => {
    if (card) navigation.setOptions(kickerHeader(card.leagueName, LEAGUE_CARD_TEXT.screenTitle));
  }, [navigation, card]);

  if (!card) {
    return (
      <View style={ui.centered} testID={load.status === 'loading' ? 'league-card-loading' : 'league-card-error'}>
        {load.status === 'loading' ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={ui.muted}>{LEAGUE_CARD_TEXT.loading}</Text>
          </>
        ) : (
          <>
            <Text style={ui.body}>{LEAGUE_CARD_TEXT.loadFailed}</Text>
            <Pressable style={ui.buttonSecondary} onPress={() => void reload()} accessibilityRole="button">
              <Text style={ui.buttonSecondaryText}>{LEAGUE_CARD_TEXT.retry}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  // Poeng per hull i stableford, netto per hull i slagspill på netto-aksen,
  // og bare slagene på et brutto-kort i slagspill.
  const points = isPointsBased(card.format);
  const net = !points && card.axis === 'net';
  const rows: ScorecardRowKind[] = points ? ['strokes', 'points'] : net ? ['strokes', 'net'] : ['strokes'];

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
      testID="league-card-screen"
    >
      <View style={styles.headingBlock}>
        <Text style={[styles.heading, { color: colors.text }]} accessibilityRole="header">
          {leagueCardHeading(card.player.name)}
        </Text>
        <Text style={[styles.intro, { color: colors.muted }]}>
          {leagueCardSubtitle(card.roundLabel, card.leagueName)}
        </Text>
        <Text style={[styles.intro, { color: colors.text }]} testID="league-card-result">
          {leagueCardResultLine(card)}
        </Text>
      </View>

      <View style={styles.cardWrap} testID="league-card">
        <ScorecardGrid
          grid={card.grid}
          rows={rows}
          footer={<ScorecardTotals totals={card.grid.totals} showNet={net} showPoints={points} />}
        />
      </View>
    </ScrollView>
  );
}

const INTRO_LINE = interLine(14, 20.3, { multiline: true });

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingBottom: 32 },
  headingBlock: { paddingTop: 4, paddingHorizontal: 20, paddingBottom: 14, gap: 4 },
  heading: { ...fraunces(500, 26, 31.2, { multiline: true }) },
  intro: { ...INTRO_LINE, fontFamily: FONTS.sans, marginTop: INTRO_LINE.marginTop + 4 },
  cardWrap: { paddingHorizontal: 20 },
});
