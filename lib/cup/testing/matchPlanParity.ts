import type { WizardPlayer, WizardTeeBox } from '../matchPlan';

/**
 * Felles fixture for kriterium 18 i #2752: fra samme plan gir appen og nettet like
 * kamper for hvert av de fire oppsettene. Nettets veiviser (vitest) og appens skjerm
 * (jest) trykker seg gjennom hver sin flate med disse dataene og skal sende akkurat
 * `matchPlanParity.expected.json`. Handicap-strategien er uten tilfeldighet.
 */
export const PARITY_TEAM_1: WizardPlayer[] = [
  { id: 'nord-1', displayName: 'Anna', hcpIndex: 4.2, gender: 'ladies' },
  { id: 'nord-2', displayName: 'Bjørn', hcpIndex: 11.5, gender: 'mens' },
  { id: 'nord-3', displayName: 'Cecilie', hcpIndex: 18.3, gender: 'ladies' },
  { id: 'nord-4', displayName: 'Dag', hcpIndex: 26.0, gender: 'mens' },
];

export const PARITY_TEAM_2: WizardPlayer[] = [
  { id: 'sor-1', displayName: 'Eva', hcpIndex: 6.1, gender: 'ladies' },
  { id: 'sor-2', displayName: 'Frode', hcpIndex: 9.9, gender: 'mens' },
  { id: 'sor-3', displayName: 'Gro', hcpIndex: 21.4, gender: 'ladies' },
  { id: 'sor-4', displayName: 'Hans', hcpIndex: 30.0, gender: 'mens' },
];

export const PARITY_PLAYERS: WizardPlayer[] = [...PARITY_TEAM_1, ...PARITY_TEAM_2];

export const PARITY_TEE: WizardTeeBox = {
  id: 'tee-gul',
  name: 'Gul',
  slope_mens: 128,
  course_rating_mens: 71.2,
  par_total_mens: 72,
  slope_ladies: 124,
  course_rating_ladies: 72.8,
  par_total_ladies: 72,
};

export const PARITY_PRESET_IDS = ['klassisk', 'fourball-singler', 'singler', 'splittet-cup-dag'] as const;

export type ParityPresetId = (typeof PARITY_PRESET_IDS)[number];
