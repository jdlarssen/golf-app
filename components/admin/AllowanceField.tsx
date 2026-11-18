'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { Input } from '@/components/ui/Input';
import { CARD_FIELD_HINT } from '@/components/ui/CardField';

/**
 * Netto/brutto-toggle for handicap-allowance.
 *
 * Generalisert fra `FourballAllowanceField` (#217) til mode-uavhengig
 * komponent som brukes på tvers av alle game-mode-wizards (#266).
 *
 * Kontrollerer en hidden input med konfigurerbart felt-navn:
 *  - «Netto» (default) → admin velger allowance 0..`maxPct` (100 som standard), default per mode.
 *  - «Brutto» → input skjules, hidden-felt sendes som 0 til server.
 *
 * Datamodellen er én DB-kolonne (`games.hcp_allowance_pct`,
 * `tournaments.fourball_allowance_pct`, eller `games.mode_config.team_handicap_pct`
 * for texas): 0 = brutto, 1..`maxPct` = netto med den prosenten. Validatorene
 * i `lib/games/gamePayload.ts` håndhever range; her er det kun UX.
 *
 * Brukes i to varianter:
 *   1. **Uncontrolled** — komponenten holder egen state. Cup-create-form
 *      lar `initialPct` defaulte til `defaultPct`.
 *   2. **Controlled** — `value` + `onChange` settes, verdien lever i parent
 *      (wizard-pathen via `useGameFormState`). Toggle-state persisterer
 *      når admin navigerer mellom wizard-steg. Sett `hideHiddenInput=true`
 *      hvis parent rendrer en sentral hidden input — toggle-en blir da
 *      bare et UI-kontroll.
 *
 * #2282: kortstilen fra Nyttspill-5-avansert-a — legenden er kickeren over
 * kortet, Netto/Brutto er to valgkort og prosenten et kortfelt med hint.
 */
type Props = {
  /**
   * Form field name for hidden input. F.eks. `hcp_allowance_pct`,
   * `fourball_allowance_pct`, `texas_team_handicap_pct`.
   */
  fieldName: string;
  /**
   * Default netto-prosent. 85 for fourball matchplay (WHS), 100 for de
   * fleste solo/team-modi, 25/10 for texas avhengig av lag-størrelse.
   */
  defaultPct: number;
  /**
   * Header inne i fieldset. F.eks. «Scoring», «Lag-handicap».
   */
  legend: string;
  /**
   * Beskrivende paragraf under legend. Forklarer hva toggle-en styrer.
   */
  description?: string;
  /**
   * Tekst under tall-input når netto er valgt. F.eks.
   * «WHS-standard for fourball matchplay er 85.»
   */
  nettoHelperText?: string;
  /**
   * Tekst som vises når brutto er valgt. F.eks.
   * «Ingen handicap — laveste gross-score per hull vinner.»
   */
  bruttoHelperText: string;
  /**
   * Label på selve tall-feltet. Default fra catalog «Allowance (%)».
   */
  inputLabel?: string;
  /**
   * Initial state for uncontrolled-modus. Ignoreres når `value`/`onChange`
   * er satt. Default = `defaultPct`.
   */
  initialPct?: number;
  /**
   * Controlled-modus: når `value` OG `onChange` er satt, lever verdien i
   * parent-state. Wizarden bruker denne varianten så toggle-state ikke
   * mistes ved wizard-step-bytte.
   */
  value?: number;
  onChange?: (pct: number) => void;
  /**
   * Høyeste netto-prosent feltet godtar (`max` og onChange-grensen). 100 for
   * vanlig allowance; scramble-familiens lag-handicap sender
   * `TEAM_HANDICAP_AVERAGE_PCT_MAX` fra grensens hjem (#2566).
   */
  maxPct?: number;
  /**
   * Når true, droppes det interne `<input type="hidden">`-feltet. Parent
   * forventes da å rendre en sentral hidden input selv — toggle-en er
   * bare et UI-kontroll og verdien lever i parent-state.
   */
  hideHiddenInput?: boolean;
  /**
   * #2455: vanlige prosenter som knapper, og − / + rundt tallet
   * (Nyttspill-forslag-hcp-eksempel). Uten `presets` tegnes tallfeltet som før.
   */
  presets?: readonly number[];
  /** #2455: hvor langt − og + flytter, og laveste verdi telleren går til. */
  stepPct?: number;
  /**
   * #2455: under knappene i stedet for `nettoHelperText` (eksempelet i slag).
   * Bare med `presets`, bare i netto.
   */
  footer?: ReactNode;
};

// The round − / + of the seats counter (SeatsAndDeadlineCard), as drawn.
const ROUND_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface font-sans text-xl text-text disabled:opacity-40';

// PillRadio's look as a toggle button: the share pills are pressed, not
// checked, so a value off the list (93 from a draft) has none of them on.
const PILL_BUTTON =
  'inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 font-sans text-sm font-semibold tabular-nums transition-colors duration-150';

/**
 * #2455: the next value for − / +. A value off the grid moves to the nearest
 * step in that direction (93 → 95 or 90), and the result stays in
 * `min`..`max`, so − also brings a stored value over `max` back in range.
 */
function stepPctValue(pct: number, dir: 1 | -1, step: number, min: number, max: number): number {
  const next =
    dir === 1 ? Math.floor(pct / step) * step + step : Math.ceil(pct / step) * step - step;
  return Math.min(max, Math.max(min, next));
}

export function AllowanceField({
  fieldName,
  defaultPct,
  legend,
  description,
  nettoHelperText,
  bruttoHelperText,
  inputLabel,
  initialPct,
  value,
  onChange,
  maxPct = 100,
  hideHiddenInput = false,
  presets,
  stepPct = 5,
  footer,
}: Props) {
  const t = useTranslations('allowance');
  const resolvedInputLabel = inputLabel ?? t('inputLabelDefault');
  const isControlled = value !== undefined && onChange !== undefined;
  const seed = initialPct ?? defaultPct;
  // pct = aktuelt valg (0 = brutto, 1..maxPct = netto). Uncontrolled-varianten
  // holder rå-verdien lokalt; controlled-varianten leser fra parent.
  const [uncontrolledPct, setUncontrolledPct] = useState<number>(seed);
  const pct = isControlled ? (value as number) : uncontrolledPct;

  // Mode-state. Husker «sist valgte netto-prosent» separat fra pct (som blir
  // 0 i brutto-modus) så bytte tilbake til netto gjenoppretter forrige verdi
  // istedenfor å falle tilbake til default.
  const initialSeed = isControlled ? (value as number) : seed;
  const [mode, setMode] = useState<'netto' | 'brutto'>(
    initialSeed === 0 ? 'brutto' : 'netto',
  );
  const [lastNettoPct, setLastNettoPct] = useState<number>(
    initialSeed === 0 ? defaultPct : initialSeed,
  );

  function commitPct(next: number) {
    if (isControlled) {
      (onChange as (n: number) => void)(next);
    } else {
      setUncontrolledPct(next);
    }
  }

  function selectMode(nextMode: 'netto' | 'brutto') {
    setMode(nextMode);
    if (nextMode === 'brutto') {
      if (pct > 0) setLastNettoPct(pct);
      commitPct(0);
    } else {
      commitPct(lastNettoPct);
    }
  }

  function setNettoPct(next: number) {
    setLastNettoPct(next);
    commitPct(next);
  }

  const radioGroupName = `${fieldName}__scoring_mode`;
  const inputId = `${fieldName}__input`;
  const shownPct = pct === 0 ? lastNettoPct : pct;

  return (
    <FormSection legend={legend}>
      {description && <FormSectionText>{description}</FormSectionText>}

      <ChoiceCardGrid columns={2} label={legend}>
        <RadioChoiceCard
          name={radioGroupName}
          value="netto"
          checked={mode === 'netto'}
          onChange={() => selectMode('netto')}
          height={52}
          title={t('nettoLabel')}
        />
        <RadioChoiceCard
          name={radioGroupName}
          value="brutto"
          checked={mode === 'brutto'}
          onChange={() => selectMode('brutto')}
          height={52}
          title={t('bruttoLabel')}
        />
      </ChoiceCardGrid>

      {mode === 'netto' && !presets && (
        <Input
          variant="card"
          id={inputId}
          label={resolvedInputLabel}
          hint={nettoHelperText}
          type="number"
          min={0}
          max={maxPct}
          step={1}
          value={shownPct}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 0 && v <= maxPct) {
              setNettoPct(v);
            }
          }}
          inputClassName="tabular-nums"
        />
      )}

      {mode === 'netto' && presets && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span
              id={`${inputId}-label`}
              className="font-sans text-[13px] leading-[normal] font-semibold text-text"
            >
              {t('stepperLabel')}
            </span>
            <span
              role="group"
              aria-labelledby={`${inputId}-label`}
              className="flex items-center gap-2.5"
            >
              <button
                type="button"
                aria-label={t('stepLess', { step: stepPct })}
                disabled={shownPct <= stepPct}
                onClick={() => setNettoPct(stepPctValue(shownPct, -1, stepPct, stepPct, maxPct))}
                className={ROUND_BUTTON}
              >
                −
              </button>
              {/* The number is a field too, so any share can be typed, and the
                  «Endre» on a red Format row still finds `…__input` to focus
                  (ReadyStep). It is drawn as the artboard's plain number. */}
              <span className="flex items-baseline font-serif text-[22px] font-semibold tabular-nums text-text">
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  aria-label={resolvedInputLabel}
                  aria-describedby={!footer && nettoHelperText ? `${inputId}-desc` : undefined}
                  min={0}
                  max={maxPct}
                  step={1}
                  value={shownPct}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isInteger(v) && v >= 0 && v <= maxPct) {
                      setNettoPct(v);
                    }
                  }}
                  style={{ width: `calc(${String(shownPct).length}ch + 2px)` }}
                  className="min-w-0 rounded-sm border-0 bg-transparent p-0 text-center font-serif text-[22px] leading-[normal] font-semibold tabular-nums text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span aria-hidden="true">&nbsp;%</span>
              </span>
              <button
                type="button"
                aria-label={t('stepMore', { step: stepPct })}
                disabled={shownPct >= maxPct}
                onClick={() => setNettoPct(stepPctValue(shownPct, 1, stepPct, stepPct, maxPct))}
                className={ROUND_BUTTON}
              >
                +
              </button>
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const pressed = shownPct === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setNettoPct(p)}
                  className={`${PILL_BUTTON} ${
                    pressed
                      ? 'bg-primary text-white dark:text-bg'
                      : 'border border-border bg-surface text-text hover:bg-primary-soft'
                  }`}
                >
                  {t('pctValue', { pct: p })}
                </button>
              );
            })}
          </div>

          {footer ??
            (nettoHelperText && (
              <p id={`${inputId}-desc`} className={CARD_FIELD_HINT}>
                {nettoHelperText}
              </p>
            ))}
        </>
      )}

      {mode === 'brutto' && (
        <p className="font-sans text-xs leading-[1.4] text-muted">{bruttoHelperText}</p>
      )}

      {!hideHiddenInput && (
        <input type="hidden" name={fieldName} value={String(pct)} />
      )}
    </FormSection>
  );
}
