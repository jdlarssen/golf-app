'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Fokuserbare elementer som faktisk står I tab-rekkefølgen. `tabindex="-1"`
 * betyr «programmatisk fokuserbar, men hopp over ved Tab», og fella må hoppe
 * over dem av samme grunn som nettleseren gjør det: avvis-dialogen i
 * påmeldings-flaten starter med et honeypot-felt (`display:none`,
 * `tabindex="-1"`) som ellers ville stått først i lista. Nettleseren nekter å
 * fokusere et skjult felt, så initial-fokus + hver Tab ville blitt spist uten
 * at fokus flyttet seg. (jsdom fokuserer det gladelig — derfor bor regelen
 * her, ikke i en test.)
 */
const FOCUSABLE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
]
  .map((tag) => `${tag}:not([tabindex="-1"])`)
  .join(', ');

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('disabled'));
}

export interface ModalFocus<T extends HTMLElement> {
  /** Settes som `ref` på dialog-elementet fokus skal holdes innenfor. */
  containerRef: RefObject<T | null>;
  /**
   * Flytter fokus til første fokuserbare element i dialogen (faller tilbake på
   * selve containeren). Brukes når en dialog selv disabler alt mens den venter
   * på et server-kall og må hente fokus tilbake etterpå.
   */
  focusFirst: () => void;
}

/**
 * Fokus-håndtering for dialoger (#1357): fanger elementet som åpnet dialogen,
 * flytter fokus inn i den, holder Tab/Shift+Tab innenfor, og legger fokus
 * tilbake på utløseren når dialogen lukkes eller unmountes.
 *
 * `role="dialog"` + `aria-modal="true"` lover skjermlesere at bakgrunnen er
 * uinteressant — uten dette holder ikke koden det løftet (WCAG 2.4.3).
 * Mønsteret er hentet fra `components/FormatGuideSheet.tsx`, som selv gikk over
 * på hooken i #1590 da den fikk testdekning.
 *
 * ⚠️ Effekten har deps `[open]` ALENE, og hooken tar derfor ingen callbacks:
 * Escape-lukking blir liggende i hver dialog. Hadde vi tatt `onClose` inn og
 * lagt den i deps (slik FormatGuideSheet gjør), ville hver re-render av
 * forelderen — HoleClient rendres på nytt av realtime- og sync-oppdateringer
 * mens arket står åpent — kjørt cleanup og revet fokus ut av den åpne dialogen.
 * Containeren eies av hooken av samme grunn: en ref laget her er stabil for
 * `react-hooks/exhaustive-deps`, mens en ref inn som parameter ville blitt
 * krevd i deps.
 *
 * Initial fokus er første fokuserbare element i DOM-rekkefølge (typisk første
 * valg-knapp) — ikke containeren, som gir dårligere annonsering av selve valget.
 */
export function useModalFocus<T extends HTMLElement = HTMLElement>(
  open: boolean,
): ModalFocus<T> {
  const containerRef = useRef<T | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    const container = containerRef.current;
    const [first] = getFocusable(container);
    (first ?? container)?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const container = containerRef.current;
    const [firstFocusable] = getFocusable(container);
    (firstFocusable ?? container)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const el = containerRef.current;
      if (!el) return;

      const active = document.activeElement;
      // Containeren selv teller som «utenfor»: den har tabIndex={-1} og ligger
      // foran alt innholdet, så Shift+Tab derfra skal wrappe til siste element.
      const inside =
        active instanceof Node && active !== el && el.contains(active);

      const focusable = getFocusable(el);
      if (focusable.length === 0) {
        // Alt er disabled (dialogen venter på et server-kall). Slipp ikke fokus
        // ut i bakgrunnen — hold det på containeren til knappene våkner igjen.
        event.preventDefault();
        if (!inside) el.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Tilbake til knappen som åpnet dialogen. Målet kan være borte (unmount,
      // eller touch der knappen aldri fikk fokus) — derfor optional chaining.
      previouslyFocused.current?.focus();
      previouslyFocused.current = null;
    };
  }, [open]);

  return { containerRef, focusFirst };
}
