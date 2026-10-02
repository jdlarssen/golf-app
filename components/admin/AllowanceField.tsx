'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { Input } from '@/components/ui/Input';

/**
 * Netto/brutto-toggle for handicap-allowance.
 *
 * Generalisert fra `FourballAllowanceField` (#217) til mode-uavhengig
 * komponent som brukes på tvers av alle game-mode-wizards (#266).
 *
 * Kontrollerer en hidden input med konfigurerbart felt-navn:
 *  - «Netto» (default) → admin velger allowance 0..100, default per mode.
 *  - «Brutto» → input skjules, hidden-felt sendes som 0 til server.
 *
 * Datamodellen er én DB-kolonne (`games.hcp_allowance_pct`,
 * `tournaments.fourball_allowance_pct`, eller `games.mode_config.team_handicap_pct`
 * for texas): 0 = brutto, 1..100 = netto med den prosenten. Validatorene
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
   * Når true, droppes det interne `<input type="hidden">`-feltet. Parent
   * forventes da å rendre en sentral hidden input selv — toggle-en er
   * bare et UI-kontroll og verdien lever i parent-state.
   */
  hideHiddenInput?: boolean;
};

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
  hideHiddenInput = false,
}: Props) {
  const t = useTranslations('allowance');
  const resolvedInputLabel = inputLabel ?? t('inputLabelDefault');
  const isControlled = value !== undefined && onChange !== undefined;
  const seed = initialPct ?? defaultPct;
  // pct = aktuelt valg (0 = brutto, 1..100 = netto). Uncontrolled-varianten
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

  const radioGroupName = `${fieldName}__scoring_mode`;
  const inputId = `${fieldName}__input`;

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

      {mode === 'netto' && (
        <Input
          variant="card"
          id={inputId}
          label={resolvedInputLabel}
          hint={nettoHelperText}
          type="number"
          min={0}
          max={100}
          step={1}
          value={pct === 0 ? lastNettoPct : pct}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isInteger(v) && v >= 0 && v <= 100) {
              setLastNettoPct(v);
              commitPct(v);
            }
          }}
          inputClassName="tabular-nums"
        />
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
