// #2255: «Hull for hull» i appen — flisa på spillets side når runden er
// avsluttet.
//
// Webbens side har en egen visning per format. Appen tar dem format for
// format (`lib/holeByHole.ts` sier hvilke), og tegner samme modell som webben
// (`lib/leaderboard/soloScorecard.ts`, `lib/leaderboard/wolfHoles.ts`,
// `lib/leaderboard/ninesHoles.ts`). I en blind runde som pågår holdes alt
// tilbake, som på webben.
//
// Slagene er de lokale, seedet fra serveren når skjermen åpnes. Etter at
// runden er avsluttet gir RLS deltakerne alle slag i spillet, så appen leser
// med spillerens egen sesjon (webben bruker service-role her, #1632).
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { GameStatus } from '../../../../lib/games/status';
import {
  revealState,
  shouldHideNetto,
  type ScoreVisibility,
} from '../../../../lib/games/visibility';
import { NinesHoleCardsView } from '../components/holes/NinesHoleCardsView';
import { SoloScorecardView } from '../components/holes/SoloScorecardView';
import { WolfHoleCardsView } from '../components/holes/WolfHoleCardsView';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { seedGameScores } from '../data/seedScores';
import { buildHoleByHole, holeByHoleKind, waitsForChoices } from '../lib/holeByHole';
import { HOLES_TEXT } from '../lib/holesCopy';
import { CHOICES_MISSING_HOLES_TEXT, SEED_FAILED_TEXT } from '../lib/seedCopy';
import type { ScoringExtras } from '../lib/scoringContext';
import { useGameChoices } from '../lib/useChoices';
import { useGameBundle, useLocalScores } from '../lib/useGameData';
import type { ScreenProps } from '../navigation';
import { useTheme } from '../theme';

export function HoleByHole({ route }: ScreenProps<'HoleByHole'>) {
  const { colors, ui } = useTheme();
  const { gameId } = route.params;
  const { bundle, loading } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId);
  // Wolf regner med valgene fra serveren (hvem som var ulv og valgte hva),
  // som tavla. Andre formater fyrer ingen spørring (`choiceSourceFor`).
  const { extras, failed: choicesFailed } = useGameChoices(
    gameId,
    bundle?.game.gameMode ?? '',
    // Et avsluttet spill endres ikke: prøv igjen bare til første svar, så ingen polling.
    bundle?.game.status === 'finished' ? null : undefined,
  );
  // Hentingen av slagene: mens den pågår, og uten noe lokalt, står et hjul i
  // stedet for et tomt kort. Feiler den (uten nett), sier en linje det, for et
  // kort med bare telefonens slag ser ellers ferdig ut.
  const [seed, setSeed] = useState<'loading' | 'done' | 'failed'>('loading');

  // Starter som 'loading'; `gameId` er en ruteparameter, så en ny verdi er en
  // ny skjerm og ingen nullstilling trengs her.
  // Utfallet settes først når slagene er lest på nytt fra telefonen, ellers
  // står et tomt kort et øyeblikk mellom hjulet og det ferdige kortet.
  useEffect(() => {
    void seedGameScores(gameId)
      .then(
        () => 'done' as const,
        () => 'failed' as const,
      )
      .then(async (result) => {
        await reload();
        setSeed(result);
      });
  }, [gameId, reload]);

  const needsChoices = bundle != null && waitsForChoices(holeByHoleKind(bundle.game), extras);
  const waiting =
    !bundle || (seed === 'loading' && scores.length === 0) || (needsChoices && !choicesFailed);
  if (waiting) {
    return (
      <View style={ui.centered} testID="hole-by-hole-loading">
        {loading || bundle ? (
          <ActivityIndicator color={colors.primary} testID="hole-by-hole-spinner" />
        ) : (
          <Text style={ui.error}>Fikk ikke tak i spillet.</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="hole-by-hole-screen">
      {seed === 'failed' ? (
        <Text style={[ui.muted, { marginBottom: 8 }]} testID="hole-by-hole-seed-failed">
          {SEED_FAILED_TEXT}
        </Text>
      ) : null}
      {needsChoices ? (
        // Valgene kom ikke (uten nett, og aldri hentet før): motoren kan ikke
        // regne Wolf uten dem. Samme ærlige beskjed som tavla, ikke et hjul
        // som aldri stopper.
        <Text style={ui.muted} testID="hole-by-hole-choices-missing">
          {CHOICES_MISSING_HOLES_TEXT}
        </Text>
      ) : (
        <HoleByHoleBody bundle={bundle} scores={scores} extras={extras} />
      )}
    </ScrollView>
  );
}

/** Kroppen, eksportert for render-testen (samme grep som `LeaderboardBody`). */
export function HoleByHoleBody({
  bundle,
  scores,
  extras = {},
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  /** Valgene formatet trenger fra serveren (Wolf). */
  extras?: ScoringExtras;
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
        <Text style={[ui.body, { color: colors.muted, fontStyle: 'italic' }]}>{`«${HOLES_TEXT.goodLuck}»`}</Text>
      </View>
    );
  }

  const model = buildHoleByHole(bundle, scores, extras);
  if (!model) {
    return (
      <Text style={ui.muted} testID="hole-by-hole-unavailable">
        {HOLES_TEXT.notAvailable}
      </Text>
    );
  }

  if (model.kind === 'wolf') {
    return (
      <WolfHoleCardsView
        cards={model.wolf}
        subtitle={model.subtitle}
        players={bundle.players}
        finished={game.status === 'finished'}
      />
    );
  }
  if (model.kind === 'nines') {
    return (
      <NinesHoleCardsView
        cards={model.nines}
        subtitle={model.subtitle}
        players={bundle.players}
        finished={game.status === 'finished'}
      />
    );
  }
  return (
    <SoloScorecardView
      card={model.card}
      metric={model.kind === 'solo-stableford' ? 'points' : 'net'}
      subtitle={model.subtitle}
      players={bundle.players}
      finished={game.status === 'finished'}
    />
  );
}
