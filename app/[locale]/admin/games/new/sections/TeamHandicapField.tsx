'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FormSection, FormSectionText } from '@/components/ui/FormSection';
import { ChoiceCardGrid, RadioChoiceCard } from '@/components/ui/ChoiceCard';
import { Input } from '@/components/ui/Input';
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
 * #3002 (F23): tre valgkort på én rad (variant A). «Forbundets vekting» vekter
 * hver spiller etter NGF vedlegg C, «Egen prosent» er arrangørens andel av
 * lagets snitt, og «Brutto» er 0. Nye Texas- og Florida-spill starter på
 * forbundets vekting, Ambrose på sin egen formel (`defaultTeamHandicapRule`).
 *
 * Egen prosent: arrangøren setter tallet som prosent av lagets SNITT-handicap,
 * slik klubbene snakker om det («snittet og så 80 %»). Appen lagrer og scorer
 * fortsatt på prosent av SUMMEN (`mode_config.team_handicap_pct`);
 * oversettelsen skjer i `lib/games/teamHandicapUnit.ts` og går begge veier her,
 * så redigeringsflyten viser samme tall arrangøren tastet. Hjelpeteksten sier
 * alltid begge tall, så ingen kan taste 80 og tro de fikk noe annet.
 *
 * `rule` er `null` for et lagret spill uten nøkkelen (laget før #3002): kortet
 * «Egen prosent» (eller «Brutto») er valgt, og skjemaet sender ingen regel, så
 * en lagring legger aldri nøkkelen på spillet. Brutto og Egen prosent beholder
 * `null`; bare et trykk på «Forbundets vekting» eller et bytte bort fra den
 * skriver en regel.
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

type Choice = 'ngf' | 'pct' | 'gross';

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

  const choice: Choice = rule === 'ngf' ? 'ngf' : sumPct === 0 ? 'gross' : 'pct';

  // The last share above 0, so «Brutto» → «Egen prosent» brings it back
  // instead of the start value. The parent remounts the field on a team size
  // change (`key={teamSize}`), which re-seeds it.
  const [lastSumPct, setLastSumPct] = useState<number>(
    sumPct > 0 ? sumPct : (defaultTeamHandicapPct(mode, teamSize as FormatTeamSize) ?? 0),
  );

  const averagePct = sumPctToAveragePct(lastSumPct, teamSize);
  // Intl direkte (ikke next-intls useFormatter): gir «26,7» på norsk uten å
  // kreve en provider — enhetstestene stubber bare useLocale/useTranslations.
  const sumPctText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(lastSumPct);

  type Key = Parameters<typeof t>[0];
  const key = (name: string) => `${prefix}.${name}` as Key;

  function select(next: Choice) {
    if (next === 'ngf') {
      onRuleChange('ngf');
      if (sumPct === 0) onSumPctChange(lastSumPct);
      return;
    }
    // Leaving the weighting writes `pct`; a stored game without a rule keeps
    // `null`, so its save adds no key.
    if (rule === 'ngf') onRuleChange('pct');
    onSumPctChange(next === 'gross' ? 0 : lastSumPct);
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
  const radioName = `${prefix}_team_handicap_rule__choice`;

  return (
    <FormSection legend={legend}>
      <FormSectionText>{t(key('description'))}</FormSectionText>

      <ChoiceCardGrid columns={3} label={legend}>
        <RadioChoiceCard
          name={radioName}
          value="ngf"
          checked={choice === 'ngf'}
          onChange={() => select('ngf')}
          height={64}
          layout="dense"
          title={t('ruleNgfTitle')}
        />
        <RadioChoiceCard
          name={radioName}
          value="pct"
          checked={choice === 'pct'}
          onChange={() => select('pct')}
          height={64}
          layout="dense"
          title={t('rulePctTitle')}
        />
        <RadioChoiceCard
          name={radioName}
          value="gross"
          checked={choice === 'gross'}
          onChange={() => select('gross')}
          height={64}
          layout="dense"
          title={tAllowance('bruttoLabel')}
        />
      </ChoiceCardGrid>

      {choice === 'ngf' && <p className={CARD_FIELD_HINT}>{t(`ngfHelper${suffix}` as Key)}</p>}

      {choice === 'pct' && (
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

      {choice === 'gross' && (
        <p className="font-sans text-xs leading-[1.4] text-muted">{t(key('bruttoHelper'))}</p>
      )}
    </FormSection>
  );
}
