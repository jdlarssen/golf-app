/**
 * Tema-preferanse — bindeledd mellom brukervalget på Profil og CSS-kontrakten i
 * `app/globals.css`.
 *
 * CSS-kontrakten (uendret, se globals.css):
 *   - Standard er lys (`:root`).
 *   - OS-mørk slår inn via `@media (prefers-color-scheme: dark)` på
 *     `:root:not([data-theme='light'])` — altså OS bestemmer SÅFREMT ingen
 *     eksplisitt `data-theme='light'` står på <html>.
 *   - `[data-theme='dark']` tvinger mørk uansett OS.
 *   - `[data-theme='light']` tvinger lys og blokkerer OS-mørk-spørringen.
 *
 * Derav de tre preferansene:
 *   - 'auto'  → fjern `data-theme` → følg OS.
 *   - 'light' → sett `data-theme='light'` → alltid lys.
 *   - 'dark'  → sett `data-theme='dark'`  → alltid mørk.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'auto',
  'light',
  'dark',
] as const;

/** localStorage-nøkkel for det persisterte temavalget. */
export const THEME_STORAGE_KEY = 'torny-theme';

/** Type-guard for en ukjent streng (f.eks. fra localStorage). */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === 'auto' || value === 'light' || value === 'dark'
  );
}

/**
 * Leser det lagrede temavalget. SSR-trygg: returnerer 'auto' når window/
 * localStorage ikke finnes (server) eller ved ugyldig/manglende verdi.
 */
export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'auto';
  } catch {
    // Privat modus / blokkert storage — fall tilbake til OS-følging.
    return 'auto';
  }
}

/**
 * Persisterer temavalget. 'auto' fjerner nøkkelen (ingen override lagret).
 * SSR-trygg og feiltolerant (privat modus kan kaste).
 */
export function storeThemePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return;
  try {
    if (preference === 'auto') {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage utilgjengelig — valget gjelder kun for denne økten (DOM-en under).
  }
}

/**
 * Skriver valget til DOM-en ved å sette/fjerne `data-theme` på <html> per
 * CSS-kontrakten over. SSR-trygg (no-op uten document).
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = preference;
  }
}

/**
 * Render-blokkerende inline-script som legges i <head> og påfører lagret tema
 * FØR første paint. Uten den faller appen tilbake til OS-auto på hver load
 * (CSS-en følger OS når <html> mangler `data-theme`), mens Profil-pillen
 * fortsatt leser localStorage og viser «Lys»/«Mørk» — nettopp mismatchen i
 * #991. Speiler {@link readStoredThemePreference} + {@link applyThemePreference},
 * men må være en ren JS-streng siden den kjører før React hydrerer.
 *
 * Bruker {@link THEME_STORAGE_KEY} så nøkkelen har ett hjem. Kun 'light'/'dark'
 * settes; 'auto' (nøkkel fjernet) og ugyldige verdier lar <html> stå urørt så
 * OS-media-spørringen bestemmer.
 */
export function themeBootstrapScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY);
  return `(function(){try{var t=localStorage.getItem(${key});if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
}
