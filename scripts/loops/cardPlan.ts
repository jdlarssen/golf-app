// Delt plan-artefakt for Discord-PR-kortet (#1159, Del B). `decide-pr-card.ts`
// skriver den; `screenshot-routes.ts` og `post-pr-card.ts` leser den. Holder
// stegene løst koblet: gating skjer én gang, de tunge stegene leser resultatet.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type CardPlanPr = {
  number: number;
  title: string;
  htmlUrl: string;
  draft: boolean;
  summary: string | null;
};

// Tre-utfall (#1406): 'noop' (ingen kort — som dagens shouldCard=false), 'card'
// (dagens knapp-kort) eller 'auto-merge' (kortet merger selv, poster kvittering).
export type CardOutcome = 'auto-merge' | 'card' | 'noop';

export type CardPlan = {
  outcome: CardOutcome;
  isGui: boolean;
  /** PR-head-SHA-en decide gatet mot — merge-guarden (`sha`-param) og re-sjekk bruker den. */
  headSha: string | null;
  /** Hvilken port som degraderte auto-merge → card (kun logging/observability). */
  demotedReason?: string | null;
  pr: CardPlanPr | null;
  changedFiles: string[];
  /**
   * Issue-numrene PR-body-en lover å lukke (`closes|fixes|resolves #N` — aldri
   * `refs`/`part of`). Post-steget lukker dem selv etter en auto-merge: GitHubs
   * auto-close fyrer ikke på workflow-merger (#1634). Decide har body-en, post
   * har den ikke — derfor bæres numrene i planen.
   */
  closesIssues: number[];
};

export const PLAN_PATH = process.env.CARD_PLAN_PATH || 'pr-card-plan.json';

export function writePlan(plan: CardPlan, path = PLAN_PATH): void {
  writeFileSync(path, JSON.stringify(plan, null, 2));
}

export function readPlan(path = PLAN_PATH): CardPlan | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CardPlan;
  } catch {
    return null;
  }
}
