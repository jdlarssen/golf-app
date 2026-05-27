'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { AllowanceField } from '@/components/admin/AllowanceField';
import type { CupEligibleFormat } from '@/lib/formats/getFormatsForIntent';
import { formatIconFor } from '@/lib/formats/icons';
import { createTournamentDraft } from '@/lib/cup/actions';

type Props = {
  cupEligibleFormats: CupEligibleFormat[];
};

/**
 * CupSetup — wizard step 2 cup-variant. Erstatter dagens
 * `/admin/cup/new/page.tsx` med en in-wizard form for å opprette cup
 * (tournament-rad). Felt-keys speiler `createTournamentDraft` så vi gjenbruker
 * eksisterende server-action uten endring der.
 *
 * Multi-select av tillatte match-formats persisteres ikke i F2 — kolonnen
 * `tournaments.allowed_match_formats` lander i et follow-up issue. UI-en er
 * med fordi det er en del av F2 kontrakt-en (signalisere intent + sette
 * forventninger), men cup-detalj-sidens «+ Match»-knapper viser alle
 * cup-eligible formats inntil filtering legges på i Wave-2.
 */
export function CupSetup({ cupEligibleFormats }: Props) {
  // Multi-select state — initialiserer med alle cup-eligible formats valgt
  // (default-all) så admin ikke trenger å klikke for å bekrefte standard-
  // oppsettet. Endring av valgene har ingen runtime-effekt i F2 (se docstring).
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    () => new Set(cupEligibleFormats.map((f) => f.slug)),
  );

  function toggleFormat(slug: string) {
    setSelectedFormats((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  }

  const atLeastOneFormat = selectedFormats.size >= 1;

  if (cupEligibleFormats.length === 0) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted"
      >
        Ingen cup-eligible formats konfigurert — kontakt admin.
      </p>
    );
  }

  return (
    <form action={createTournamentDraft} className="space-y-5">
      <Input
        label="Cup-navn"
        id="name"
        name="name"
        required
        maxLength={80}
        placeholder="Tørny Cup 2026 — Sommer-runde"
      />

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
          Lag-navn
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Lag 1"
            id="team_1_name"
            name="team_1_name"
            required
            maxLength={40}
            placeholder="Team Skog"
          />
          <Input
            label="Lag 2"
            id="team_2_name"
            name="team_2_name"
            required
            maxLength={40}
            placeholder="Team Sjø"
          />
        </div>
      </fieldset>

      <Input
        label="Point-mål"
        id="points_to_win"
        name="points_to_win"
        required
        type="text"
        inputMode="decimal"
        pattern="[0-9]+([,.][0-9]+)?"
        defaultValue="4,5"
        hint="Vanlig regel: halvparten av tilgjengelige point + 0,5. Med 8 matches blir det 4,5."
      />

      <AllowanceField
        fieldName="fourball_allowance_pct"
        defaultPct={85}
        legend="Scoring for fourball-matches"
        description="Styrer handicap for fourball-matches. Netto bruker en andel av hver spillers handicap, brutto teller laveste gross per hull per side."
        nettoHelperText="Andel av hver spillers handicap som teller. WHS-standard for four-ball matchplay er 85."
        bruttoHelperText="Ingen handicap — laveste gross-score per hull per side vinner. Vanlig format på ekte Ryder Cup."
      />

      <AllowanceField
        fieldName="foursomes_allowance_pct"
        defaultPct={50}
        legend="Scoring for foursomes-matches"
        description="Styrer handicap for foursomes-matches (alternate shot). Netto gir høyeste lag en andel av differansen i lagenes summerte handicap; brutto teller bare lagets gross-slag uten allowance."
        nettoHelperText="Andel av differansen i lagenes summerte handicap som høyeste lag får som strokes. WHS-standard for foursomes matchplay er 50."
        bruttoHelperText="Ingen handicap — lagets gross-score per hull avgjør, ingen extra strokes."
      />

      <fieldset>
        <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted mb-2">
          Tillatte match-formats
        </legend>
        <p className="text-xs text-muted mb-3">
          Velg hvilke spillformer som er lov i matchene. Du legger til de
          enkelte matchene etter cupen er opprettet.
        </p>
        <ul className="space-y-2">
          {cupEligibleFormats.map((f) => {
            const checked = selectedFormats.has(f.slug);
            const id = `cup_format_${f.slug}`;
            return (
              <li key={f.slug}>
                <label
                  htmlFor={id}
                  className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    checked
                      ? 'border-primary bg-primary-soft text-text'
                      : 'border-border bg-surface text-text hover:bg-primary-soft/60'
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFormat(f.slug)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span
                    className={`flex h-6 w-6 items-center justify-center ${
                      checked ? 'text-primary' : 'text-muted'
                    }`}
                  >
                    {formatIconFor(f.icon_key, 22)}
                  </span>
                  <span className="flex-1">
                    <span className="block font-serif text-sm text-text">
                      {f.display_name}
                    </span>
                    <span className="block text-xs text-muted">
                      {f.short_description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {!atLeastOneFormat && (
          <p className="mt-2 text-xs text-danger">
            Velg minst ett match-format.
          </p>
        )}
      </fieldset>

      <div className="pt-2">
        <Button
          type="submit"
          className="w-full"
          disabled={!atLeastOneFormat}
        >
          Opprett cup
        </Button>
      </div>
    </form>
  );
}
