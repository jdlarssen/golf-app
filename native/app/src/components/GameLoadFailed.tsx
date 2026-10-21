// #1954 D2: når selve spillet ikke kom og ingenting er lagret på telefonen.
//
// Spill-hjem hadde «Prøv igjen» fra Del B. Hull, «Hull for hull», scorekortet
// og tavla viste bare «Fikk ikke tak i spillet.», og godkjenningen og
// avslutningen sin egen variant, uten en vei videre enn å gå ut og inn igjen.
// Etter tidstaket (`data/timedFetch.ts`) havner en henting på svak dekning
// nettopp her, så alle sju deler denne blokka. Skjermen eier beholderen rundt
// (`ui.centered`), blokka bare teksten og knappen.
//
// `notFound` (gjennomgangen av #2622): serveren svarte, men spillet finnes ikke
// for spilleren (slettet, eller skjult av RLS, #1954 Del B). Da er det ikke
// nettet, og «Prøv igjen» ville gitt samme svar. Setningen sier det, uten knapp.
import { Pressable, Text } from 'react-native';
import { ERROR_BOUNDARY_TEXT } from '../lib/errorBoundaryCopy';
import { GAME_LOAD_RETRY_TEXT, GAME_NOT_FOUND_TEXT } from '../lib/seedCopy';
import { useTheme } from '../theme';

// Unionen gjør `onRetry` valgfri for et spill som er borte (`notFound`), men
// hindrer ikke at en skjerm sender den likevel: skjermene gir `notFound` fra
// `useGameBundle` som en boolsk verdi. Er spillet borte, brukes den ikke.
type GameLoadFailedProps =
  /** Spillet er borte: ingen «Prøv igjen», så `onRetry` trengs ikke. */
  | { notFound: true }
  | {
      /** Spillet er borte for spilleren (`useGameBundle().notFound`). */
      notFound?: boolean;
      onRetry: () => void;
      /** Avslutningen sier «runden», ikke «spillet» (`END_GAME_TEXT.loadFailed`). */
      text?: string;
    };

export function GameLoadFailed(props: GameLoadFailedProps) {
  const { ui } = useTheme();
  if (props.notFound) {
    return (
      <Text style={ui.body} testID="game-not-found">
        {GAME_NOT_FOUND_TEXT}
      </Text>
    );
  }
  return (
    <>
      <Text style={ui.error} testID="game-error">
        {props.text ?? GAME_LOAD_RETRY_TEXT}
      </Text>
      <Pressable accessibilityRole="button" style={ui.buttonSecondary} onPress={props.onRetry} testID="game-retry">
        <Text style={ui.buttonSecondaryText}>{ERROR_BOUNDARY_TEXT.retry}</Text>
      </Pressable>
    </>
  );
}
