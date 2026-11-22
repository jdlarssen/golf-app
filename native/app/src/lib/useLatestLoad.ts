import { useMemo, useRef } from 'react';

/**
 * Bare det sist startede kallet får skrive til skjermen: et eldre svar kan komme
 * etter et nyere (fokus og trekk-for-å-laste samtidig). `begin()` først i kallet,
 * `isCurrent(token)` rett etter hver `await`.
 */
export function useLatestLoad(): { begin: () => number; isCurrent: (token: number) => boolean } {
  const seq = useRef(0);
  return useMemo(
    () => ({
      begin: () => ++seq.current,
      isCurrent: (token: number) => token === seq.current,
    }),
    [],
  );
}
