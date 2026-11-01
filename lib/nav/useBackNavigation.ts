'use client';

import { useCallback, type MouseEvent } from 'react';
import { pickBackEntry } from './backTarget';

// TypeScript 5.9 har `NavigationHistoryEntry` i lib.dom, men ikke `window.navigation`.
type NavigationEntry = { key: string; url: string | null; index: number };
type NavigationApi = {
  entries(): NavigationEntry[];
  currentEntry: NavigationEntry | null;
  traverseTo(key: string): { finished?: Promise<unknown> };
};

/** Safari 26.2 har delvis støtte, så begge metodene sjekkes hver for seg. */
function navigationApi(): NavigationApi | null {
  const api = (window as unknown as { navigation?: Partial<NavigationApi> }).navigation;
  if (typeof api?.entries !== 'function' || typeof api.traverseTo !== 'function' || !api.currentEntry) {
    return null;
  }
  return api as NavigationApi;
}

/**
 * Klikket på tilbake-pila (#2746). Har historikken en skjerm å gå til, går pila
 * dit. Ellers følger lenka `href` som før: kald start, varsel, delt lenke og
 * nettlesere uten Navigation API. Langt trykk og «åpne i ny fane» er lenka.
 */
export function useBackNavigation() {
  return useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const api = navigationApi();
    if (!api) return;
    const entries = api.entries();
    const target = pickBackEntry(entries, api.currentEntry!.index);
    if (target === null) return;

    event.preventDefault();
    const href = event.currentTarget.href;
    // Avvises traverseringen, skal ikke pila stå død. En ny navigasjon som
    // avbryter den (AbortError) er derimot allerede på vei et sted.
    api.traverseTo(entries[target]!.key).finished?.catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== 'AbortError') window.location.assign(href);
    });
  }, []);
}
