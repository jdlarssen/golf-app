// Registrerte ci.yml-kjøringer for én head-SHA — ETT hjem for oppslaget (#1520).
// To kallsteder deler det: mottakerens CI-port bak merge-knappen (discordActions.ts,
// #1124) og PR-kortets grønt-gate (scripts/loops/decide-pr-card.ts).
//
// Vi leser Actions-workflow-KJØRINGEN for denne fila, IKKE check-runs: fine-grained
// PAT-er kan ikke gis Checks-lesetilgang (det finnes ikke som PAT-permission), men
// «Actions: Read» dekker workflow-runs. Endres CI-filnavnet, oppdater her.
//
// Egen modul (ikke inne i discordActions.ts): decide-pr-card.ts kjøres via
// `npx --yes tsx` uten npm ci, og workflowen henter KUN `scripts/loops` + `lib/loops`
// fra main (#1181). En import ut av lib/loops ville dratt inn app-kode fra PR-head-en.

import { type GitHubClient } from './discordActions';

export const CI_WORKFLOW_FILE = 'ci.yml';

export type CiWorkflowRun = { id: number; status: string; conclusion: string | null };

/** Feil (`ok: false`) holdes adskilt fra «ingen kjøring registrert» (`runs: []`) —
 *  kallstedene er fail-closed og må kunne skille dem. */
export type CiRunsLookup = { ok: true; runs: CiWorkflowRun[] } | { ok: false; status: number };

/**
 * Henter ci.yml-kjøringene GitHub har registrert for `headSha`.
 * Endepunktet krever FULL 40-tegns SHA — en forkortet SHA gir tom liste.
 */
export async function fetchCiRunsForSha(
  gh: GitHubClient,
  repo: string,
  headSha: string,
): Promise<CiRunsLookup> {
  const res = await gh.rest(
    'GET',
    `/repos/${repo}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=${headSha}&per_page=20`,
  );
  if (res.status !== 200) return { ok: false, status: res.status };
  return { ok: true, runs: (res.json as { workflow_runs?: CiWorkflowRun[] }).workflow_runs ?? [] };
}
