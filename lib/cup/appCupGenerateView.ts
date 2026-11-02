import type { PairingStrategy } from './cupPairing';
import type { CupSessionFormat } from './cupTemplates';
import type { CupBatchMatch, WizardPlayer, WizardTeeBox } from './matchPlan';

/**
 * Wire-typene for «Fordel & generer» i appen (#2752). Rutene er
 * `app/api/cup/[id]/generate`, `matches` og `start`.
 */

/** Den lagrede planen. `null` i viewet: bane eller tee mangler, eller teen er borte. */
export type AppCupGeneratePlan = {
  courseName: string;
  teeName: string;
  tee: WizardTeeBox;
  presetId: string;
  customSessions: CupSessionFormat[];
  strategy: PairingStrategy;
};

export type AppCupGenerateView = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  team1Name: string;
  team2Name: string;
  /** Taket for en personlig cup. `null`: ingen tak (klubb-cup eller administrator). */
  matchCap: number | null;
  /** Kampene som finnes, sendt tilbake med genereringen. */
  existingMatchCount: number;
  plan: AppCupGeneratePlan | null;
  players: WizardPlayer[];
};

/**
 * `expectedExisting` er antallet kampene viewet viste. En generering legger til kamper,
 * så et nytt forsøk etter et tapt svar ville laget alle på nytt. Stemmer ikke tallet,
 * svarer ruta `matches_changed` og skriver ingenting.
 */
export type CupMatchesBody = {
  matches: CupBatchMatch[];
  expectedExisting: number;
};
