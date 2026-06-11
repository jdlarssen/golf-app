'use client';

import { useTranslations } from 'next-intl';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import { FormatStyleBadge } from '@/components/ui/FormatStyleBadge';
import type { GameMode } from '@/lib/scoring/modes/types';

type Props = {
  formats: FormatForIntent[];
  value: string | undefined;
  onChange: (slug: string) => void;
  /**
   * Åpner «?»-arket fokusert på et bestemt format (#498). Kalles av «Slik funker
   * det →» på det valgte kortet. Utelatt → ingen «Slik funker det»-knapp.
   */
  onShowGuide?: (slug: string) => void;
  disabled?: boolean;
};

/**
 * FormatGrid — wizard step 2 hovedflyt (Kompis / Klubb / Solo). Mottar en
 * flat liste av synlige formats for valgt intent (sortert is_primary desc,
 * sort_order asc av getFormatsForIntent) og partisjonerer på is_primary i
 * UI-laget — F1-helper sender flat liste på prinsipp.
 *
 * #498: kompakt stil. Kollapset kort viser bare navn + spillestil-chip(s) — den
 * som vet hva hen vil scroller ikke gjennom forklaringer. Det valgte kortet
 * utvider til full bredde og viser kort-beskrivelsen + «Slik funker det →» som
 * åpner format-arket (uten å forlate veiviseren). Ikonene er fjernet.
 */
export function FormatGrid({
  formats,
  value,
  onChange,
  onShowGuide,
  disabled = false,
}: Props) {
  const t = useTranslations('wizard.formatGrid');
  const primary = formats.filter((f) => f.is_primary);
  const secondary = formats.filter((f) => !f.is_primary);
  // Vis gruppe-headere kun når begge gruppene finnes — ellers holder legenden.
  const showGroupHeaders = primary.length > 0 && secondary.length > 0;

  if (formats.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted"
      >
        {t('emptyState')}
      </p>
    );
  }

  function renderCard(f: FormatForIntent) {
    const selected = value === f.slug;

    if (selected) {
      return (
        <div
          key={f.slug}
          className="col-[1/-1] overflow-hidden rounded-xl border border-primary bg-primary-soft shadow-[inset_0_0_0_1px_var(--primary)]"
        >
          <button
            type="button"
            role="radio"
            aria-checked={true}
            aria-label={f.display_name}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(f.slug);
            }}
            className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-serif text-base leading-snug text-text">
              {f.display_name}
            </span>
            <FormatStyleBadge mode={f.slug as GameMode} className="shrink-0" />
          </button>
          <div className="space-y-2 border-t border-primary/25 px-3 pb-3 pt-2">
            <p className="font-sans text-xs leading-snug text-muted">
              {f.short_description}
            </p>
            {onShowGuide && (
              <button
                type="button"
                onClick={() => onShowGuide(f.slug)}
                className="font-sans text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {t('howItWorks')}
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <button
        key={f.slug}
        type="button"
        role="radio"
        aria-checked={false}
        aria-label={f.display_name}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(f.slug);
        }}
        className="flex min-h-[44px] flex-col items-start justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:bg-primary-soft/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* Navn over chip(s): et ett-ords navn («Stableford») + den brede
            to-chip-baren (Solo + Lag) fikk ikke plass på én rad i en smal
            2-kol-celle, så navnet fløt oppå chippen. Stablet unngår det og gir
            lange navn full bredde. */}
        <span className="font-serif text-sm leading-snug text-text">
          {f.display_name}
        </span>
        <FormatStyleBadge mode={f.slug as GameMode} />
      </button>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-5">
      <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('legend')}
      </legend>

      {primary.length > 0 && (
        <div className="space-y-2">
          {showGroupHeaders && (
            <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t('groupPrimary')}
            </p>
          )}
          <div
            role="radiogroup"
            aria-label={t('groupAriaMain')}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {primary.map(renderCard)}
          </div>
        </div>
      )}

      {secondary.length > 0 && (
        <div className="space-y-2">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t('groupSecondary')}
          </p>
          <div
            role="radiogroup"
            aria-label={t('groupAriaSecondary')}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {secondary.map(renderCard)}
          </div>
        </div>
      )}
    </fieldset>
  );
}
