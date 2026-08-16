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
  const tModes = useTranslations('modes');
  const tContent = useTranslations('formatGuide');
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
    const name = tModes(f.slug as Parameters<typeof tModes>[0]);

    if (selected) {
      const description = tContent.raw(
        `content.${f.slug}.shortDescription` as Parameters<
          typeof tContent.raw
        >[0],
      ) as string;
      return (
        // data-focus-inset: knappen er flush mot topp/venstre/høyre, så
        // `overflow-hidden` klipper en outline med positiv offset helt bort
        // (#1402).
        <div
          key={f.slug}
          data-focus-inset
          className="col-[1/-1] overflow-hidden rounded-xl border border-primary bg-primary-soft shadow-[inset_0_0_0_1px_var(--primary)]"
        >
          {/* Ekstra negativ offset (#1673): den valgte flisen har både
              border-primary og en inset-linje i samme farge, så inset-ringen på
              −2px la seg rett inntil dem — 4 px sammenhengende primary, ingen
              ring å se. −5px flytter ringen inn i flisens egen fyll, så det står
              3 px primary-soft mellom kanten og ringen.

              Inline style, ikke en Tailwind-utility: fokusreglene i globals.css
              ligger BEVISST utenfor alle @layer (se kommentaren over dem), og
              lag-rekkefølge slår spesifisitet — en `focus-visible:[outline-offset:…]`
              i @layer utilities taper mot dem uansett hvor spesifikk den er
              (målt i Chromium: utility gir −2px, inline gir −5px). Offseten er
              inert når ingen outline tegnes, så den koster ingenting utenfor
              tastaturfokus. */}
          <button
            type="button"
            role="radio"
            aria-checked={true}
            aria-label={name}
            disabled={disabled}
            style={{ outlineOffset: '-5px' }}
            onClick={() => {
              if (!disabled) onChange(f.slug);
            }}
            className="flex w-full min-h-[44px] items-center justify-between gap-2 px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="font-serif text-base leading-snug text-text">
              {name}
            </span>
            <FormatStyleBadge mode={f.slug as GameMode} className="shrink-0" />
          </button>
          <div className="space-y-2 border-t border-primary/25 px-3 pb-3 pt-2">
            <p
              data-testid="format-desc"
              className="font-sans text-xs leading-snug text-muted"
            >
              {description}
            </p>
            {onShowGuide && (
              <button
                type="button"
                onClick={() => onShowGuide(f.slug)}
                className="font-sans text-xs font-medium text-primary hover:underline"
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
        aria-label={name}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(f.slug);
        }}
        className="flex min-h-[44px] flex-col items-start justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors duration-150 hover:bg-primary-soft/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* Navn over chip(s): et ett-ords navn («Stableford») + den brede
            to-chip-baren (Solo + Lag) fikk ikke plass på én rad i en smal
            2-kol-celle, så navnet fløt oppå chippen. Stablet unngår det og gir
            lange navn full bredde. */}
        <span className="font-serif text-sm leading-snug text-text">
          {name}
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
