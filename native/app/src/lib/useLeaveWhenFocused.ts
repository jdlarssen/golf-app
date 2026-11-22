// A screen that moves on after an answer (saved, sent, finished) must only
// move when it is the screen in front. Without a target, `goBack` and
// `backTo` act on whichever screen is focused when the answer lands: a push
// notification or an app link opened on top would be thrown away, and the
// wizard's back lock would take a step by itself (#2757).
//
// The answer is not lost: if another screen lies on top, the move waits and
// runs when this screen is in front again, as `CupGenerate` does with
// `arrived`. If the screen is closed first, nothing runs.
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef } from 'react';

/** The part of the screen's navigation object this needs. */
export type FocusAware = { isFocused(): boolean };

/**
 * Returns `leave(go)`: runs `go` now if the screen is focused, or else the
 * next time it gains focus. A later call replaces a waiting one.
 */
export function useLeaveWhenFocused(navigation: FocusAware): (go: () => void) => void {
  const waiting = useRef<(() => void) | null>(null);

  useFocusEffect(
    useCallback(() => {
      const go = waiting.current;
      if (go === null) return;
      waiting.current = null;
      go();
    }, []),
  );

  return useCallback(
    (go: () => void) => {
      if (navigation.isFocused()) {
        waiting.current = null;
        go();
      } else {
        waiting.current = go;
      }
    },
    [navigation],
  );
}
