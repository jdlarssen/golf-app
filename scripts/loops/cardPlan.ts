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

export type CardPlan = {
  shouldCard: boolean;
  isGui: boolean;
  pr: CardPlanPr | null;
  changedFiles: string[];
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
