'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { FormatGuideList, type FormatGuideEntry } from '@/components/FormatGuideList';
import { useModalFocus } from '@/hooks/useModalFocus';

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
  // Fokus inn i arket ved åpning (lukk-knappen er første fokuserbare element),
  // Tab holdes innenfor, og fokus tilbake på «?»-knappen ved lukking. Delt
  // mønster siden #1590 — arket hadde sin egen kopi fra #498.
  const { containerRef } = useModalFocus<HTMLDivElement>(open);

  // Esc-lukk. Ligger her og ikke i hooken: hooken tar bevisst ingen callbacks
  // (deps `[open]` alene) så en ny `onClose`-closure ikke river fokus ut.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Når arket åpnes med et valgt format: åpne og scroll til det kortet.
  useEffect(() => {
    if (!open) return;
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
        ref={containerRef}
        tabIndex={-1}
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
            type="button"
            onClick={onClose}
            aria-label={t('closeButton')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg text-muted hover:bg-surface-2"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <FormatGuideList
            entries={entries}
            withDetailLinks={false}
            cardIdPrefix={CARD_ID_PREFIX}
            cardLabels={{
              showRules: t('cardShowRules'),
              hideRules: t('cardHideRules'),
              readMore: t('cardReadMore'),
            }}
          />
        </div>
      </div>
    </div>
  );
}
