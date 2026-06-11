'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FormatGuideList, type FormatGuideEntry } from '@/components/FormatGuideList';

const CARD_ID_PREFIX = 'format-guide-';

/**
 * «?»-arket i veiviseren (#498). Et bunn-ark som glir opp OVER veiviseren med
 * hele format-oppslagsverket, så man kan lese «slik funker det» uten å forlate
 * flyten (og dermed miste fremdriften). Lukk (✕ / backdrop / Esc) legger
 * veiviseren tilbake nøyaktig der man var.
 *
 * Modellert etter `components/hole/SpecificValueSheet` (role=dialog, aria-modal,
 * Esc + backdrop-lukk), men `position: fixed` så det dekker hele skjermen, med
 * fokus-felle og reduced-motion-trygg animasjon (klasser i globals.css).
 *
 * `focusKey` (= valgt format-slug) åpner og scroller til det formatet når arket
 * åpnes fra «Slik funker det →» på et valgt kort.
 */
export function FormatGuideSheet({
  open,
  entries,
  focusKey,
  onClose,
}: {
  open: boolean;
  entries: FormatGuideEntry[];
  focusKey?: string;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Esc-lukk + fokus-felle (Tab sykler innenfor arket) + fokus-gjenoppretting.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    function getFocusable(): HTMLElement[] {
      if (!sheetRef.current) return [];
      return Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !sheetRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Legg fokus tilbake på elementet som åpnet arket (typisk «?»-knappen).
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  // Når arket åpnes: fokuser lukk-knappen, og åpne/scroll til valgt format.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    if (!focusKey) return;
    const target = document.getElementById(`${CARD_ID_PREFIX}${focusKey}`);
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      target.scrollIntoView({
        block: 'start',
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
  }, [open, focusKey]);

  const t = useTranslations('formatGuide');

  if (!open) return null;

  return (
    <div
      className="format-guide-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,22,18,0.45)]"
      onClick={onClose}
      data-testid="format-guide-backdrop"
    >
      <div
        ref={sheetRef}
        className="format-guide-sheet flex max-h-[88vh] w-full max-w-xl flex-col rounded-t-2xl bg-bg shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={t('sheetAriaLabel')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden />
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-text">{t('sheetTitle')}</h2>
            <p className="text-xs text-muted">{t('sheetSubtitle')}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('closeButton')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg text-muted hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <FormatGuideList
            entries={entries}
            withDetailLinks={false}
            cardIdPrefix={CARD_ID_PREFIX}
          />
        </div>
      </div>
    </div>
  );
}
