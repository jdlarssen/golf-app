// Native N4 (#1828): resultattabellen.
//
// Datasløyfa er hull-sidens, uendret: bundelen fra `cache_entries`, slagene fra
// SQLite, `seedGameScores` ved åpning og PÅHENG på det realtime-abonnementet
// appen alt har (`subscribeGameScores`). Ingen ny kanal — hver merge leser den
// lokale basen på nytt, og tabellen regnes om fra den. Det er derfor tabellen
// oppdaterer seg når en makker taster på andre siden av banen, og hvorfor den
// står støtt i flymodus.
//
// Regnestykket er ikke her: `computeGameLeaderboard` bygger konteksten og kaller
// den DELTE motoren. Denne fila velger visning og passer på hva reveal-runden
// får lov å vise.
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { GameMode } from '../../../../lib/scoring/modes/types';
import {
  ResultView,
  WEB_ONLY_RESULT_MESSAGE,
} from '../components/leaderboard/ResultView';
import { SideTournamentSection } from '../components/leaderboard/SideTournamentSection';
import { CalmNote, LeaderTable } from '../components/leaderboard/Table';
import type { LocalScore } from '../data/db';
import type { GameBundle } from '../data/gameBundle';
import { subscribeGameScores } from '../data/realtime';
import { seedGameScores } from '../data/seedScores';
import { gateReason } from '../lib/formatGate';
import { grossLines, leaderboardVisibility, nameLookup } from '../lib/leaderboardModel';
import {
  computeGameLeaderboard,
  type ScoringContextProblem,
  type ScoringExtras,
} from '../lib/scoringContext';
import { buildSideTournament } from '../lib/sideTournament';
import { useGameChoices } from '../lib/useChoices';
import { useGameBundle, useLocalScores } from '../lib/useGameData';
import { useSideWinners, type SideWinnersState } from '../lib/useSideWinners';
import type { ScreenProps } from '../navigation';
import { COLORS, ui } from '../theme';

/** Samme takt som hull-siden — en drain eller en merge skjer utenfor React. */
const POLL_MS = 1500;

/**
 * Skal sideturneringen vises for dette spillet?
 *
 * Tre betingelser, og alle tre er webbens. Den viktigste er `finished`:
 * sideturneringen er et post-game-reveal-element på ALLE formater der
 * (`formats/stableford.tsx:115-121`, `formats/skins.tsx:102`,
 * `renderMatchplaySideSection` returnerer `undefined` når spillet ikke er
 * avsluttet). En pågående runde viser derfor ingenting side-relatert, uansett
 * hva `sideTournamentEnabled` sier — og fyrer heller ikke hentingen.
 */
function sideTournamentVisible(bundle: GameBundle | null): boolean {
  if (bundle === null) return false;
  const { game } = bundle;
  return (
    game.status === 'finished' &&
    game.sideTournamentEnabled &&
    gateReason(game) === null
  );
}

/** Ingen henting gjort. `neverLoaded` er true, men leses kun av side-spill. */
const NO_SIDE_WINNERS: SideWinnersState = { rows: [], neverLoaded: true };

/**
 * Hva spilleren får se når motoren ikke kan svare. Alle er rolige: en
 * resultattabell som ikke finnes er ikke en feil spilleren har gjort.
 */
const PROBLEM_MESSAGES: Record<ScoringContextProblem, string> = {
  'unknown-mode': WEB_ONLY_RESULT_MESSAGE,
  'missing-config': WEB_ONLY_RESULT_MESSAGE,
  // Wolf og BBB uten valgene: ærlig melding, ALDRI en tabell der hvert hull
  // står uavgjort. Den ville sett like autoritativ ut som en ekte stilling.
  'missing-choices':
    'Fikk ikke tak i valgene som avgjør poengene. Tabellen kommer når nettet er tilbake.',
  'no-course': 'Banen er ikke satt for denne runden ennå.',
  'no-players': 'Ingen spillere står oppført i runden.',
};

export function Leaderboard({ route }: ScreenProps<'Leaderboard'>) {
  const { gameId } = route.params;
  const { bundle, loading } = useGameBundle(gameId);
  const { scores, reload } = useLocalScores(gameId, POLL_MS);
  // Wolf og BBB henter halve regnestykket fra serveren. Alle andre formater
  // svarer `null` på kilde-spørsmålet og koster ikke et eneste kall — og før
  // bundelen har landet vet vi ikke formatet, så vi spør ikke da heller.
  const { extras } = useGameChoices(gameId, bundle?.game.gameMode ?? '');
  // LD/CTP-vinnerne. Samme gate som seksjonen selv, så et aktivt spill aldri
  // koster et nettkall for data det uansett ikke får vise.
  const sideWinners = useSideWinners(gameId, sideTournamentVisible(bundle));

  // Påheng på det eksisterende abonnementet: samme kanal hull-siden bruker,
  // og hver merge leser den lokale basen på nytt.
  useEffect(() => {
    const unsubscribe = subscribeGameScores(gameId, {
      onMerge: () => {
        void reload();
      },
    });
    void seedGameScores(gameId)
      .catch(() => undefined)
      .then(() => reload());
    return unsubscribe;
  }, [gameId, reload]);

  if (!bundle) {
    return (
      <View style={ui.centered} testID="leaderboard-loading">
        {loading ? (
          <ActivityIndicator color={COLORS.forest} />
        ) : (
          <Text style={ui.error}>Fikk ikke tak i spillet.</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={ui.scroll} testID="leaderboard-screen">
      <Text style={ui.title}>{bundle.game.name}</Text>
      <Text style={ui.muted} testID="leaderboard-subtitle">
        {bundle.game.status === 'finished' ? 'Sluttresultat' : 'Slik står det nå'}
      </Text>

      <LeaderboardBody
        bundle={bundle}
        scores={scores}
        extras={extras}
        sideWinners={sideWinners}
      />
    </ScrollView>
  );
}

/**
 * Rekkefølgen på portene er hele poenget: gaten først (et format appen ikke
 * fører, viser den heller ingen tall for), reveal deretter — FØR noe regnes ut
 * — og først til slutt motoren.
 */
export function LeaderboardBody({
  bundle,
  scores,
  extras = {},
  sideWinners = NO_SIDE_WINNERS,
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
  /** Wolf-/BBB-valgene. Tomt for de elleve formatene som ikke bruker dem. */
  extras?: ScoringExtras;
  /**
   * LD/CTP-vinnerne fra skjermen over. Defaulten lar de mange testene som
   * rendrer kroppen direkte slippe å bry seg — de spillene har ikke
   * sideturnering, og da leses feltet aldri.
   */
  sideWinners?: SideWinnersState;
}) {
  const { game } = bundle;
  const nameOf = nameLookup(bundle.players);

  if (gateReason(game) !== null) {
    return <CalmNote text={WEB_ONLY_RESULT_MESSAGE} testID="leaderboard-web-only" />;
  }

  const visibility = leaderboardVisibility(
    game.scoreVisibility,
    game.status,
    game.gameMode as GameMode,
  );

  // Matchplay i reveal: ingenting. Ikke engang brutto — i en duell ER
  // brutto-forskjellen stillingen, og webben viser derfor `RevealHiddenView`.
  if (visibility === 'hidden') {
    return (
      <CalmNote
        text="Resultatet avsløres når runden avsluttes."
        testID="leaderboard-hidden"
      />
    );
  }

  if (visibility === 'gross-only') {
    return <GrossOnlyTable bundle={bundle} scores={scores} />;
  }

  const outcome = computeGameLeaderboard(bundle, scores, extras);
  if (!outcome.ok) {
    // Ingen sideturnering her heller: uten et `ModeResult` finnes det ingen
    // fasit for lag-grupperingen, og en gjettet gruppering ville delt ut
    // sidepoengene til feil lag.
    return (
      <CalmNote text={PROBLEM_MESSAGES[outcome.problem]} testID="leaderboard-web-only" />
    );
  }

  // Sideturneringen ligger UNDER hovedresultatet — ikke i en fane som på
  // webben. Matchplay får dermed nøyaktig webbens plassering (der ligger den
  // allerede under duellkortet, #585), og de øvrige formatene en RN-tilpasning
  // av fanen. Appen har ingen fane-primitiv, og #1830-mandatet er
  // native-følelse framfor pikselparitet.
  const sideSection = sideTournamentVisible(bundle) ? (
    <SideTournamentSection
      {...buildSideTournament({
        bundle,
        scores,
        sideWinnerRows: sideWinners.rows,
        result: outcome.result,
      })}
      sideWinnersUnavailable={sideWinners.neverLoaded}
    />
  ) : null;

  // Bingo Bango Bongo deler ut poeng for prestasjoner, ikke for slag: en bingo
  // kan stå registrert lenge før noen har tastet et tall. Slag-vakten under
  // ville skjult den tabellen bak «ingen slag ført ennå», som er sant og
  // irrelevant. Alle andre formater regner FRA slagene og beholder vakten.
  if (game.gameMode !== 'bingo_bango_bongo' && !hasAnyStroke(scores)) {
    // Sideturneringen henger med: LD/CTP kåres av arrangøren og finnes selv om
    // ingen rakk å føre et slag.
    return (
      <>
        <CalmNote
          text="Ingen slag er ført ennå. Tabellen fyller seg mens dere spiller."
          testID="leaderboard-empty"
        />
        {sideSection}
      </>
    );
  }

  return (
    <>
      <ResultView result={outcome.result} status={game.status} nameOf={nameOf} />
      {sideSection}
    </>
  );
}

/** Reveal-runde som fortsatt går: bruttoslag, ingen plassering, ingen netto. */
function GrossOnlyTable({
  bundle,
  scores,
}: {
  bundle: GameBundle;
  scores: readonly LocalScore[];
}) {
  const lines = grossLines(bundle.players, scores);
  return (
    <View testID="leaderboard-gross-only">
      <CalmNote
        text="Runden spilles blindt. Du ser bruttoslag til arrangøren avslutter."
        testID="leaderboard-reveal-note"
      />
      <LeaderTable
        testID="leaderboard-table"
        columns={[
          { key: 'name', label: 'Navn', flex: 3 },
          { key: 'gross', label: 'Brutto', numeric: true },
          { key: 'holes', label: 'Hull', numeric: true },
        ]}
        rows={lines.map((line) => ({
          key: line.userId,
          cells: [
            line.name,
            line.holesPlayed === 0 ? '—' : line.totalGross,
            line.holesPlayed,
          ],
        }))}
      />
    </View>
  );
}

/**
 * Et spill uten et eneste slag gir tabeller fulle av nuller. Motoren har ikke
 * gjort noe galt — det er bare ingenting å vise ennå, og det sier vi.
 */
function hasAnyStroke(scores: readonly LocalScore[]): boolean {
  return scores.some((score) => score.strokes != null);
}
