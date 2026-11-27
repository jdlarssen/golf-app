'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { Input } from '@/components/ui/Input';
import { PillRadio } from '@/components/ui/PillRadio';
import { CARD_FIELD_HINT } from '@/components/ui/CardField';
import { defaultTeamHandicapPct, type FormatTeamSize } from '@/lib/games/formatSetupDefaults';
import {
  TEAM_HANDICAP_AVERAGE_PCT_MAX,
  averagePctToSumPct,
  sumPctToAveragePct,
} from '@/lib/games/teamHandicapUnit';

/**
 * Lag-handicap-feltet for scramble-familien (Texas, Ambrose, Florida) — #2009.
 *
 * #3002 (F23): «Netto» og «Brutto» som valgkort øverst, som i de andre
 * formatene. Under Netto velger to små knapper regelen: «Standard» vekter hver
 * spiller etter NGF vedlegg C, og «Egen prosent» er arrangørens andel av
 * lagets snitt, med tallfeltet bare da. Brutto er 0. Nye Texas- og Florida-
 * spill starter på Standard, Ambrose på sin egen formel
 * (`defaultTeamHandicapRule`). Eieren 27.11.2026: nærmere variant B, med
 * enklere ord og færre trykk.
 *
 * Egen prosent: arrangøren setter tallet som prosent av lagets SNITT-handicap,
 * slik klubbene snakker om det («snittet og så 80 %»). Appen lagrer og scorer
 * fortsatt på prosent av SUMMEN (`mode_config.team_handicap_pct`);
 * oversettelsen skjer i `lib/games/teamHandicapUnit.ts` og går begge veier her,
 * så redigeringsflyten viser samme tall arrangøren tastet. Hjelpeteksten sier
 * alltid begge tall, så ingen kan taste 80 og tro de fikk noe annet.
 *
 * `rule` er `null` for et lagret spill uten nøkkelen (laget før #3002, eller en
 * revansje av et slikt): «Egen prosent» (eller «Brutto») er valgt, og skjemaet
 * sender ingen regel, så en lagring legger aldri nøkkelen på spillet. Brutto og
 * Egen prosent beholder `null`; bare et trykk på «Standard» eller et bytte bort
 * fra den skriver en regel.
 *
 * Én komponent for tre formater i stedet for tre nesten like blokker —
 * forrige runde viste hvor lett en 2/4-antakelse overlever i én av kopiene og
 * ikke de andre. Verdiene lever i forelderens state; de skjulte feltene
 * (`<prefix>_team_handicap_pct`, `<prefix>_team_handicap_rule`) rendres der.
 */

export type ScrambleMode = 'texas_scramble' | 'ambrose' | 'florida_scramble';

export type TeamHandicapRule = 'ngf' | 'pct';

type Props = {
  mode: ScrambleMode;
  teamSize: number;
  /** Lagret verdi — prosent av summen, som i `mode_config.team_handicap_pct`. 0 = brutto. */
  sumPct: number;
  onSumPctChange: (nextSumPct: number) => void;
  /** `null` = et lagret spill uten regel (laget før #3002). */
  rule: TeamHandicapRule | null;
  onRuleChange: (next: TeamHandicapRule | null) => void;
};

const COPY_PREFIX: Record<ScrambleMode, 'texas' | 'ambrose' | 'florida'> = {
  texas_scramble: 'texas',
  ambrose: 'ambrose',
  florida_scramble: 'florida',
};

/**
 * Hjelpetekst-nøkkel per lagstørrelse. Eksplisitt mapping, ikke en
 * `teamSize === 2 ? … : …`-kjede — den serverte 4-manns-teksten til
 * 3-mannslag før #2009.
 */
function helperSuffix(teamSize: number): '2' | '3' | '4' {
  if (teamSize === 2) return '2';
  if (teamSize === 3) return '3';
  return '4';
}

export function TeamHandicapField({
  mode,
  teamSize,
  sumPct,
  onSumPctChange,
  rule,
  onRuleChange,
}: Props) {
  const t = useTranslations('wizard.allowanceProps');
  const tAllowance = useTranslations('allowance');
  const locale = useLocale();
  const prefix = COPY_PREFIX[mode];
  const suffix = helperSuffix(teamSize);

  const gross = rule !== 'ngf' && sumPct === 0;

  // The last share above 0, so «Brutto» → «Netto» brings it back instead of
  // the start value, and the rule the organiser had under Netto. The parent
  // remounts the field on a team size change (`key={teamSize}`), which
  // re-seeds both.
  const [lastSumPct, setLastSumPct] = useState<number>(
    sumPct > 0 ? sumPct : (defaultTeamHandicapPct(mode, teamSize as FormatTeamSize) ?? 0),
  );
  const [lastNetRule, setLastNetRule] = useState<TeamHandicapRule | null>(rule);

  const averagePct = sumPctToAveragePct(lastSumPct, teamSize);
  // Intl direkte (ikke next-intls useFormatter): gir «26,7» på norsk uten å
  // kreve en provider — enhetstestene stubber bare useLocale/useTranslations.
  const sumPctText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(lastSumPct);

  type Key = Parameters<typeof t>[0];
  const key = (name: string) => `${prefix}.${name}` as Key;

  function selectGross() {
    setLastNetRule(rule);
    // Leaving Standard writes `pct`; a stored game without a rule keeps
    // `null`, so its save adds no key.
    if (rule === 'ngf') onRuleChange('pct');
    onSumPctChange(0);
  }

  function selectNet() {
    if (lastNetRule === 'ngf') onRuleChange('ngf');
    onSumPctChange(lastSumPct);
  }

  function selectRule(next: TeamHandicapRule) {
    if (next === 'ngf') onRuleChange('ngf');
    else if (rule === 'ngf') onRuleChange('pct');
  }

  /**
   * A typed share. Audit 20.11 (p11): an emptied box is not 0 (0 is brutto,
   * chosen with its own card), so an empty box or 0 keeps the last share.
   */
  function typeAveragePct(raw: string) {
    if (raw.trim() === '') return;
    const v = Number(raw);
    if (Number.isInteger(v) && v >= 1 && v <= TEAM_HANDICAP_AVERAGE_PCT_MAX) {
      const nextSumPct = averagePctToSumPct(v, teamSize);
      setLastSumPct(nextSumPct);
      onSumPctChange(nextSumPct);
    }
  }

  const legend = t(key('legend'));

  return (
    <FormSection legend={legend}>
      <FormSectionText>{t(key('description'))}</FormSectionText>

      <ChoiceCardGrid columns={2} label={legend}>
        <RadioChoiceCard
          name={`${prefix}_team_handicap__mode`}
          value="netto"
          checked={!gross}
          onChange={selectNet}
          height={52}
          title={tAllowance('nettoLabel')}
        />
        <RadioChoiceCard
          name={`${prefix}_team_handicap__mode`}
          value="brutto"
          checked={gross}
          onChange={selectGross}
          height={52}
          title={tAllowance('bruttoLabel')}
        />
      </ChoiceCardGrid>

      {!gross && (
        <>
          <div role="radiogroup" aria-label={t('ruleGroupLabel')} className="flex flex-wrap gap-2">
            <PillRadio
              name={`${prefix}_team_handicap_rule__choice`}
              value="ngf"
              checked={rule === 'ngf'}
              onChange={() => selectRule('ngf')}
            >
              {t('ruleNgfTitle')}
            </PillRadio>
            <PillRadio
              name={`${prefix}_team_handicap_rule__choice`}
              value="pct"
              checked={rule !== 'ngf'}
              onChange={() => selectRule('pct')}
            >
              {t('rulePctTitle')}
            </PillRadio>
          </div>

          {rule === 'ngf' ? (
            <p className={CARD_FIELD_HINT}>{t(`ngfHelper${suffix}` as Key)}</p>
          ) : (
            <Input
              variant="card"
              id={`${prefix}_team_handicap_pct__input`}
              label={t(key('inputLabel'))}
              hint={[t(key(`nettoHelper${suffix}`)), t('sumEquivalent', { sumPct: sumPctText })].join(' ')}
              type="number"
              min={0}
              max={TEAM_HANDICAP_AVERAGE_PCT_MAX}
              step={1}
              value={averagePct}
              onChange={(e) => typeAveragePct(e.target.value)}
              inputClassName="tabular-nums"
            />
          )}
        </>
      )}

      {gross && (
        <p className="font-sans text-xs leading-[1.4] text-muted">{t(key('bruttoHelper'))}</p>
      )}
    </FormSection>
  );
}
