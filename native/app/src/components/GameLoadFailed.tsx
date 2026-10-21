// #1954 D2: når selve spillet ikke kom og ingenting er lagret på telefonen.
//
// Spill-hjem hadde «Prøv igjen» fra Del B. Hull, «Hull for hull», scorekortet
// og tavla viste bare «Fikk ikke tak i spillet.», og godkjenningen og
// avslutningen sin egen variant, uten en vei videre enn å gå ut og inn igjen.
// Etter tidstaket (`data/timedFetch.ts`) havner en henting på svak dekning
// nettopp her, så alle sju deler denne blokka. Skjermen eier beholderen rundt
// (`ui.centered`), blokka bare teksten og knappen.
import { Pressable, Text } from 'react-native';
import { ERROR_BOUNDARY_TEXT } from '../lib/errorBoundaryCopy';
import { GAME_LOAD_RETRY_TEXT } from '../lib/seedCopy';
import { useTheme } from '../theme';

export function GameLoadFailed({
  onRetry,
  text = GAME_LOAD_RETRY_TEXT,
}: {
  onRetry: () => void;
  /** Avslutningen sier «runden», ikke «spillet» (`END_GAME_TEXT.loadFailed`). */
  text?: string;
}) {
  const { ui } = useTheme();
  return (
    <>
      <Text style={ui.error} testID="game-error">
        {text}
      </Text>
      <Pressable accessibilityRole="button" style={ui.buttonSecondary} onPress={onRetry} testID="game-retry">
        <Text style={ui.buttonSecondaryText}>{ERROR_BOUNDARY_TEXT.retry}</Text>
      </Pressable>
    </>
  );
}
