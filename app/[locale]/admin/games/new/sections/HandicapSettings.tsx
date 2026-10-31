'use client';

/**
 * HandicapSettings — the handicap fields of the «Handicap» sheet on step 5
 * (#2457). Moved unchanged from ReadyStep's old advanced panel (#1065): good
 * defaults (85/50/100 % and so on) mean the friends case never has to touch
 * them. `hideHiddenInput`: FormDataInputs (mounted on every step) mirrors the
 * values whether or not the sheet is open.
 */

import { useTranslations } from 'next-intl';
import type { GameFormState } from '../useGameFormState';
import { showsGeneralAllowanceField } from '@/lib/games/hcpAllowance';
import { AllowanceField } from '@/components/admin/AllowanceField';
import { TeamHandicapField } from './TeamHandicapField';
import { bruttoHelperKeyFor } from '@/lib/games/allowanceCopy';

export function HandicapSettings({ state }: { state: GameFormState }) {
  const tWizard = useTranslations('wizard');
  const tAllowance = useTranslations('allowance');
  const {
    gameMode,
    teamSize,
    isTexas,
    isAmbrose,
    isFlorida,
    isRoundRobin,
    hcpAllowance,
    setHcpAllowance,
    texasHandicapPct,
    setTexasHandicapPct,
    ambroseHandicapPct,
    setAmbroseHandicapPct,
    floridaHandicapPct,
    setFloridaHandicapPct,
    fourballAllowancePct,
    setFourballAllowancePct,
    foursomesAllowancePct,
    setFoursomesAllowancePct,
    greensomeAllowancePct,
    setGreensomeAllowancePct,
    chapmanAllowancePct,
    setChapmanAllowancePct,
    gruesomeAllowancePct,
    setGruesomeAllowancePct,
    roundRobinAllowancePct,
    setRoundRobinAllowancePct,
  } = state;

  return (
    <>
      {gameMode === 'fourball_matchplay' && (
        <AllowanceField
          fieldName="fourball_allowance_pct"
          defaultPct={85}
          legend={tWizard('allowanceProps.fourball.legend')}
          description={tWizard('allowanceProps.fourball.description')}
          nettoHelperText={tWizard('allowanceProps.fourball.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.fourball.bruttoHelper')}
          value={fourballAllowancePct}
          onChange={setFourballAllowancePct}
          hideHiddenInput
        />
      )}
      {gameMode === 'foursomes_matchplay' && (
        <AllowanceField
          fieldName="foursomes_allowance_pct"
          defaultPct={50}
          legend={tWizard('allowanceProps.foursomes.legend')}
          description={tWizard('allowanceProps.foursomes.description')}
          nettoHelperText={tWizard('allowanceProps.foursomes.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.foursomes.bruttoHelper')}
          value={foursomesAllowancePct}
          onChange={setFoursomesAllowancePct}
          hideHiddenInput
        />
      )}
      {gameMode === 'greensome_matchplay' && (
        <AllowanceField
          fieldName="greensome_allowance_pct"
          defaultPct={100}
          legend={tWizard('allowanceProps.greensome.legend')}
          description={tWizard('allowanceProps.greensome.description')}
          nettoHelperText={tWizard('allowanceProps.greensome.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.greensome.bruttoHelper')}
          value={greensomeAllowancePct}
          onChange={setGreensomeAllowancePct}
          hideHiddenInput
        />
      )}
      {gameMode === 'chapman_matchplay' && (
        <AllowanceField
          fieldName="chapman_allowance_pct"
          defaultPct={100}
          legend={tWizard('allowanceProps.chapman.legend')}
          description={tWizard('allowanceProps.chapman.description')}
          nettoHelperText={tWizard('allowanceProps.chapman.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.chapman.bruttoHelper')}
          value={chapmanAllowancePct}
          onChange={setChapmanAllowancePct}
          hideHiddenInput
        />
      )}
      {gameMode === 'gruesome_matchplay' && (
        <AllowanceField
          fieldName="gruesome_allowance_pct"
          defaultPct={50}
          legend={tWizard('allowanceProps.gruesome.legend')}
          description={tWizard('allowanceProps.gruesome.description')}
          nettoHelperText={tWizard('allowanceProps.gruesome.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.gruesome.bruttoHelper')}
          value={gruesomeAllowancePct}
          onChange={setGruesomeAllowancePct}
          hideHiddenInput
        />
      )}
      {isRoundRobin && (
        <AllowanceField
          fieldName="round_robin_allowance_pct"
          defaultPct={85}
          legend={tWizard('allowanceProps.roundRobin.legend')}
          description={tWizard('allowanceProps.roundRobin.description')}
          nettoHelperText={tWizard('allowanceProps.roundRobin.nettoHelper')}
          bruttoHelperText={tWizard('allowanceProps.roundRobin.bruttoHelper')}
          value={roundRobinAllowancePct}
          onChange={setRoundRobinAllowancePct}
          hideHiddenInput
        />
      )}
      {showsGeneralAllowanceField(gameMode) && (
        <AllowanceField
          fieldName="hcp_allowance_pct"
          defaultPct={100}
          legend={tWizard('allowanceProps.scoring.legend')}
          description={tWizard('allowanceProps.scoring.description')}
          nettoHelperText={tWizard('allowanceProps.scoring.nettoHelper')}
          bruttoHelperText={tAllowance(bruttoHelperKeyFor(gameMode))}
          value={hcpAllowance}
          onChange={setHcpAllowance}
          hideHiddenInput
        />
      )}
      {/* Scramble-familien (#2009): arrangøren setter lag-handicapet som
          prosent av lagets snitt; feltet oversetter til og fra den lagrede
          sum-prosenten. `key={teamSize}` forser remount ved lagstørrelse-bytte
          så netto/brutto-minnet følger re-seedingen. */}
      {isTexas && (
        <TeamHandicapField
          key={teamSize}
          mode="texas_scramble"
          teamSize={teamSize}
          sumPct={texasHandicapPct}
          onSumPctChange={setTexasHandicapPct}
        />
      )}
      {isAmbrose && (
        <TeamHandicapField
          key={teamSize}
          mode="ambrose"
          teamSize={teamSize}
          sumPct={ambroseHandicapPct}
          onSumPctChange={setAmbroseHandicapPct}
        />
      )}
      {isFlorida && (
        <TeamHandicapField
          key={teamSize}
          mode="florida_scramble"
          teamSize={teamSize}
          sumPct={floridaHandicapPct}
          onSumPctChange={setFloridaHandicapPct}
        />
      )}
    </>
  );
}
