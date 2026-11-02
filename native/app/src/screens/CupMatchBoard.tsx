// #2752: tavla til en ferdig kamp du ikke spilte, eierens svar 02.11: «Knapp til
// tavla». Nettets cup-side lenker til den samme tavla. Radene kommer fra serveren,
// som ikke sender en kamp som pågår. Tegningen er appens egen tavle, så de to ikke
// kan si noe ulikt.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import { fetchCupMatchBoard, type CupBoardResult } from '../data/cupBoard';
import { boardFailureText, FINISH_APP_TEXT, MANAGE_APP_TEXT } from '../lib/cupManageCopy';
import { toRoster } from '../lib/roster';
import { hasSoloBoard, soloBoardFor } from '../lib/soloBoard';
import { hasTeamBoard, teamBoardFor } from '../lib/teamBoard';
import { foldLocalScores } from '../lib/teamPlay';
import type { ScreenProps } from '../navigation';
import { useSession } from '../session';
import { FONTS, fraunces, interLine, TAP, useTheme } from '../theme';
import { LeaderboardBody } from './Leaderboard';

export function CupMatchBoard({ route }: ScreenProps<'CupMatchBoard'>) {
  const { colors, ui } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useSession();
  const { cupId, gameId, names } = route.params;
  const [result, setResult] = useState<CupBoardResult | null>(null);

  const load = useCallback(async () => {
    setResult(null);
    setResult(await fetchCupMatchBoard(cupId, gameId));
  }, [cupId, gameId]);

  useEffect(() => {
    let alive = true;
    void fetchCupMatchBoard(cupId, gameId).then((answer) => {
      if (alive) setResult(answer);
    });
    return () => {
      alive = false;
    };
  }, [cupId, gameId]);

  const board = useMemo(() => {
    if (!result?.ok) return null;
    const { bundle } = result;
    const scores = foldLocalScores(result.scores, toRoster(bundle.players), bundle.game.gameMode as GameMode);
    return {
      bundle,
      scores,
      soloBoard: hasSoloBoard(bundle.game) ? soloBoardFor({ bundle, scores, userId }) : null,
      teamBoard: hasTeamBoard(bundle.game) ? teamBoardFor({ bundle, scores, userId, teeShots: null }) : null,
    };
  }, [result, userId]);

  if (result === null) {
    return (
      <View style={ui.centered} testID="cup-board-loading">
        <ActivityIndicator color={colors.primary} />
        <Text style={ui.muted}>{FINISH_APP_TEXT.boardLoading}</Text>
      </View>
    );
  }
  if (board === null) {
    const reason = result.ok ? 'load_failed' : result.reason;
    const final = reason === 'not_found';
    return (
      <View style={ui.centered} testID="cup-board-failed">
        <Text style={[styles.failure, { color: final ? colors.text : colors.danger }]}>
          {final ? FINISH_APP_TEXT.boardNotFound : boardFailureText(reason)}
        </Text>
        {final ? null : (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            style={[styles.retry, { borderColor: colors.primary }]}
            testID="cup-board-retry"
          >
            <Text style={[styles.retryText, { color: colors.primary }]}>{MANAGE_APP_TEXT.retry}</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 24 }]}
      testID="cup-board-screen"
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header" testID="cup-board-names">
          {names}
        </Text>
        <Text style={[styles.line, { color: colors.muted }]}>{FINISH_APP_TEXT.boardFinal}</Text>
      </View>
      <LeaderboardBody
        bundle={board.bundle}
        scores={board.scores}
        soloBoard={board.soloBoard}
        teamBoard={board.teamBoard}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: 16 },
  head: { paddingTop: 10, gap: 6, paddingBottom: 8 },
  title: { ...fraunces(500, 26, 30, { multiline: true }) },
  line: { ...interLine(13, 18, { multiline: true }), fontFamily: FONTS.sans },
  failure: { ...interLine(15, 21, { multiline: true }), fontFamily: FONTS.sans, textAlign: 'center' },
  retry: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 20, borderWidth: 1, borderRadius: 22 },
  retryText: { fontSize: 15, fontFamily: FONTS.sansSemiBold },
});
