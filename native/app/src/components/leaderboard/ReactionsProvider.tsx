// #2754: reaksjonene ned til radene, som på nettet. Uten provider gir
// `useReactionsContext` `null`, og radene er slik de alltid har vært. Da slipper
// visningene nye props, og formater uten reaksjoner merker ingenting.
import { createContext, useContext } from 'react';
import type { GameReactions } from '../../lib/useGameReactions';

export interface ReactionsContextValue extends GameReactions {
  /** Raden har fått stripa: skjermen ruller hvis stripa dekker den. */
  onRowOpened: (rowBottom: number) => void;
}

export const ReactionsContext = createContext<ReactionsContextValue | null>(null);

export function useReactionsContext(): ReactionsContextValue | null {
  return useContext(ReactionsContext);
}
