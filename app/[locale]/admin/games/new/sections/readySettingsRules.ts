import type { GameMode } from '@/lib/scoring/modes/types';
import { showsGeneralAllowanceField } from '@/lib/games/hcpAllowance';
import { sumPctToAveragePct } from '@/lib/games/teamHandicapUnit';

/**
 * The INNSTILLINGER rows on step 5 «Klar?» (#2457): Handicap, Startkontingent,
 * Under runden and Sideturnering og premier, each with the value that is set.
 * Like `formatRowParts`, the rules hand back the value as parts, never as
 * finished text: the component owns the wording and the locale.
 */

export type ReadySettingsKey = 'handicap' | 'fee' | 'duringRound' | 'sideAndPrizes';

export type HandicapValue =
  | { kind: 'net'; pct: number }
  | { kind: 'gross' }
  /** Scramble family: percent of the team's average handicap. */
  | { kind: 'teamAverage'; pct: number };

export type ReadySettingsValue =
  | { key: 'handicap'; value: HandicapValue }
  | { key: 'fee'; value: { kind: 'none' } | { kind: 'amount'; kr: number } }
  | {
      key: 'duringRound';
      value: { visibility: 'live' | 'reveal'; peerApproval: boolean };
    }
  | {
      key: 'sideAndPrizes';
      value: { sideEnabled: boolean; prizeCount: number };
    };

export type ReadySettingsRow = ReadySettingsValue & { visible: boolean };

/** The matchplay variants with a percentage of their own (step 5 field). */
const OWN_ALLOWANCE_MODES = [
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
  'round_robin',
] as const satisfies readonly GameMode[];

const SCRAMBLE_MODES = ['texas_scramble', 'ambrose', 'florida_scramble'] as const satisfies readonly GameMode[];

type ScrambleMode = (typeof SCRAMBLE_MODES)[number];
type OwnAllowanceMode = (typeof OWN_ALLOWANCE_MODES)[number];

function isScramble(mode: GameMode): mode is ScrambleMode {
  return (SCRAMBLE_MODES as readonly GameMode[]).includes(mode);
}

function isOwnAllowance(mode: GameMode): mode is OwnAllowanceMode {
  return (OWN_ALLOWANCE_MODES as readonly GameMode[]).includes(mode);
}

/** Whether step 5 shows a handicap field for the format. */
export function showsHandicapSetting(mode: GameMode): boolean {
  return showsGeneralAllowanceField(mode) || isOwnAllowance(mode) || isScramble(mode);
}

export type ReadySettingsInput = {
  gameMode: GameMode;
  teamSize: number;
  /** The general percentage (`hcp_allowance_pct`). */
  hcpAllowance: number;
  fourballAllowancePct: number;
  foursomesAllowancePct: number;
  greensomeAllowancePct: number;
  chapmanAllowancePct: number;
  gruesomeAllowancePct: number;
  roundRobinAllowancePct: number;
  /** The scramble family's stored team handicap: percent of the SUM. */
  texasHandicapPct: number;
  ambroseHandicapPct: number;
  floridaHandicapPct: number;
  /** The raw field text, as `entryFeeKr` in the form state. */
  entryFeeKr: string;
  scoreVisibility: 'live' | 'reveal';
  requirePeerApproval: boolean;
  sideEnabled: boolean;
  /** Prizes with a filled-in description. */
  prizeCount: number;
};

function netOrGross(pct: number): HandicapValue {
  return pct === 0 ? { kind: 'gross' } : { kind: 'net', pct };
}

function handicapValue(input: ReadySettingsInput): HandicapValue {
  const { gameMode, teamSize } = input;
  switch (gameMode) {
    case 'fourball_matchplay':
      return netOrGross(input.fourballAllowancePct);
    case 'foursomes_matchplay':
      return netOrGross(input.foursomesAllowancePct);
    case 'greensome_matchplay':
      return netOrGross(input.greensomeAllowancePct);
    case 'chapman_matchplay':
      return netOrGross(input.chapmanAllowancePct);
    case 'gruesome_matchplay':
      return netOrGross(input.gruesomeAllowancePct);
    case 'round_robin':
      return netOrGross(input.roundRobinAllowancePct);
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble': {
      const sumPct =
        gameMode === 'texas_scramble'
          ? input.texasHandicapPct
          : gameMode === 'ambrose'
            ? input.ambroseHandicapPct
            : input.floridaHandicapPct;
      const pct = sumPctToAveragePct(sumPct, teamSize);
      return pct === 0 ? { kind: 'gross' } : { kind: 'teamAverage', pct };
    }
    default:
      return netOrGross(input.hcpAllowance);
  }
}

/**
 * The rows in fixed order: `handicap`, `fee`, `duringRound`, `sideAndPrizes`.
 * Handicap is visible only where step 5 has a handicap field for the format;
 * the other three always are.
 */
export function readySettingsRows(input: ReadySettingsInput): ReadySettingsRow[] {
  const fee = Number(input.entryFeeKr);
  return [
    {
      key: 'handicap',
      visible: showsHandicapSetting(input.gameMode),
      value: handicapValue(input),
    },
    {
      key: 'fee',
      visible: true,
      value: fee > 0 ? { kind: 'amount', kr: fee } : { kind: 'none' },
    },
    {
      key: 'duringRound',
      visible: true,
      value: { visibility: input.scoreVisibility, peerApproval: input.requirePeerApproval },
    },
    {
      key: 'sideAndPrizes',
      visible: true,
      value: { sideEnabled: input.sideEnabled, prizeCount: input.prizeCount },
    },
  ];
}
