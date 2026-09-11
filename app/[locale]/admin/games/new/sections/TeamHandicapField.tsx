'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AllowanceField } from '@/components/admin/AllowanceField';
import {
  averagePctToSumPct,
  sumPctToAveragePct,
} from '@/lib/games/teamHandicapUnit';

/**
 * Lag-handicap-feltet for scramble-familien (Texas, Ambrose, Florida) — #2009.
 *
 * Arrangøren setter tallet som prosent av lagets SNITT-handicap, slik
 * klubbene snakker om det («snittet og så 80 %»). Appen lagrer og scorer
 * fortsatt på prosent av SUMMEN (`mode_config.team_handicap_pct`); oversettelsen
 * skjer i `lib/games/teamHandicapUnit.ts` og går begge veier her, så
 * redigeringsflyten viser samme tall arrangøren tastet.
 *
 * Hjelpeteksten sier alltid begge tall: NGF-/Ambrose-forslaget for valgt
 * lagstørrelse, og hva arrangørens eget valg tilsvarer av summen. Da kan ingen
 * taste 80 og tro de fikk noe annet.
 *
 * Én komponent for tre formater i stedet for tre nesten like `AllowanceField`-
 * blokker i `ReadyStep` — forrige runde viste hvor lett en 2/4-antakelse
 * overlever i én av kopiene og ikke de andre.
 */

export type ScrambleMode = 'texas_scramble' | 'ambrose' | 'florida_scramble';

type Props = {
  mode: ScrambleMode;
  teamSize: number;
  /** Lagret verdi — prosent av summen, som i `mode_config.team_handicap_pct`. */
  sumPct: number;
  onSumPctChange: (nextSumPct: number) => void;
};

const FIELD_NAME: Record<ScrambleMode, string> = {
  texas_scramble: 'texas_team_handicap_pct',
  ambrose: 'ambrose_team_handicap_pct',
  florida_scramble: 'florida_team_handicap_pct',
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
}: Props) {
  const t = useTranslations('wizard.allowanceProps');
  const locale = useLocale();
  const prefix = COPY_PREFIX[mode];
  const averagePct = sumPctToAveragePct(sumPct, teamSize);
  // Intl direkte (ikke next-intls useFormatter): gir «26,7» på norsk uten å
  // kreve en provider — enhetstestene stubber bare useLocale/useTranslations.
  const sumPctText = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(sumPct);

  type Key = Parameters<typeof t>[0];
  const key = (suffix: string) => `${prefix}.${suffix}` as Key;

  const nettoHelperText = [
    t(key(`nettoHelper${helperSuffix(teamSize)}`)),
    t('sumEquivalent', { sumPct: sumPctText }),
  ].join(' ');

  return (
    <AllowanceField
      // Remount ved lagstørrelse-bytte: `handleTeamSizeChange` re-seeder
      // prosenten, og feltets interne netto/brutto-minne skal følge med.
      key={teamSize}
      fieldName={FIELD_NAME[mode]}
      defaultPct={averagePct}
      legend={t(key('legend'))}
      description={t(key('description'))}
      nettoHelperText={nettoHelperText}
      bruttoHelperText={t(key('bruttoHelper'))}
      inputLabel={t(key('inputLabel'))}
      value={averagePct}
      onChange={(nextAveragePct) =>
        onSumPctChange(averagePctToSumPct(nextAveragePct, teamSize))
      }
      hideHiddenInput
    />
  );
}
