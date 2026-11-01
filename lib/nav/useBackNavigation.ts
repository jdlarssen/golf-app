'use client';

import { useRouter } from 'next/navigation';
import { useCallback, type MouseEvent } from 'react';
import { lacksHrefChoices, namesSubView, pickBackEntry } from './backTarget';

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
 * dit. Ellers klatrer den til `href` med `replace`: en lenke som la til en side,
 * ville gitt neste pil denne siden å gå tilbake til, i ring (#121). Det samme
 * gjelder en undervisning, som peker på sin egen forelder, og en oppføring som
 * mangler det pila bærer.
 *
 * Uten Navigation API følges lenka, som før. Langt trykk og «åpne i ny fane» er
 * også lenka.
 */
export function useBackNavigation() {
  const router = useRouter();
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const api = navigationApi();
      if (!api) return;
      const href = event.currentTarget.getAttribute('href');
      if (!href) return;

      event.preventDefault();
      const entries = api.entries();
      const current = api.currentEntry!;
      const target =
        current.url && namesSubView(current.url, href) ? null : pickBackEntry(entries, current.index);
      const entry = target === null ? null : entries[target]!;
      if (!entry || (entry.url && lacksHrefChoices(entry.url, href))) {
        router.replace(href);
        return;
      }
      // `traverseTo` viser siden fra Next sin hurtigbuffer for tilbake og fram, der
      // utløpstiden ikke gjelder. Slag går gjennom klient-synken og tømmer den ikke,
      // så siden må hentes på nytt når den er framme. Avvises traverseringen, skal
      // ikke pila stå død. En ny navigasjon som avbryter den (AbortError) er derimot
      // allerede på vei et sted.
      api.traverseTo(entry.key).finished?.then(
        () => router.refresh(),
        (error: unknown) => {
          if ((error as { name?: string } | null)?.name !== 'AbortError') router.replace(href);
        },
      );
    },
    [router],
  );
}
