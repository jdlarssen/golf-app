// #2255: «Hull for hull» i appen — flisa på spillets side når runden er
// avsluttet.
//
// Webbens side har en egen visning per format. Appen tar dem format for
// format (`lib/holeByHole.ts` sier hvilke), og tegner samme modell som webben
// (`lib/leaderboard/soloScorecard.ts`). I en blind runde som pågår holdes alt
// tilbake, som på webben.
//
// Slagene er de lokale, seedet fra serveren når skjermen åpnes. Etter at
// runden er avsluttet gir RLS deltakerne alle slag i spillet, så appen leser
// med spillerens egen sesjon (webben bruker service-role her, #1632).
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { GameStatus } from '../../../../lib/games/status';
import {
  revealState,
  shouldHideNetto,
  type ScoreVisibility,
} from '../../../../lib/games/visibility';
import { SoloScorecardView } from '../components/holes/SoloScorecardView';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { seedGameScores } from '../data/seedScores';
import { buildHoleByHole } from '../lib/holeByHole';
import { HOLES_TEXT } from '../lib/holesCopy';
import { useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

export function HoleByHole({ route }: ScreenProps<'HoleByHole'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { bundle, loading } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId);

  useEffect(() => {
    void seedGameScores(gameId)
      .catch(() => undefined)
      .then(() => reload());
  }, [gameId, reload]);

  if (!bundle) {
    return (
      <View style={ui.centered} testID="hole-by-hole-loading">
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={ui.error}>Fikk ikke tak i spillet.</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="hole-by-hole-screen">
      <HoleByHoleBody bundle={bundle} scores={scores} />
    </ScrollView>
  );
}

/** Kroppen, eksportert for render-testen (samme grep som `LeaderboardBody`). */
export function HoleByHoleBody({
  bundle,
  scores,
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
}) {
  const { colors, ui } = useTheme();
  const { game } = bundle;

  // Blind runde som pågår: ingenting regnes eller vises før runden er ferdig.
  if (
    shouldHideNetto(
      revealState(game.scoreVisibility as ScoreVisibility, game.status as GameStatus),
    )
  ) {
    return (
      <View style={[ui.card, { alignItems: 'center' }]} testID="hole-by-hole-reveal-hidden">
        <Text style={[ui.value, { textAlign: 'center' }]}>{HOLES_TEXT.revealHiddenTitle}</Text>
        <Text style={[ui.muted, { textAlign: 'center' }]}>{HOLES_TEXT.revealHiddenSub}</Text>
        <Text style={[ui.body, { color: colors.muted, fontStyle: 'italic' }]}>{HOLES_TEXT.goodLuck}</Text>
      </View>
    );
  }

  const model = buildHoleByHole(bundle, scores);
  if (!model) {
    return (
      <Text style={ui.muted} testID="hole-by-hole-unavailable">
        {HOLES_TEXT.notAvailable}
      </Text>
    );
  }

  return (
    <SoloScorecardView
      card={model.card}
      metric={model.kind === 'solo-stableford' ? 'points' : 'net'}
      subtitle={model.subtitle}
      players={bundle.players}
    />
  );
}
