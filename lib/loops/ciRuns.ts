// Registrerte ci.yml-kjøringer for én head-SHA — ETT hjem for oppslaget (#1520).
// To kallsteder deler det: mottakerens CI-port bak merge-knappen (discordActions.ts,
// #1124) og PR-kortets grønt-gate (scripts/loops/decide-pr-card.ts). Samme modul
// eier også oppslaget av endrede filer (#2835), siden begge kallsteder trenger det
// for å velge riktig workflow.
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
// No-op-tvillingen som kjører på nøyaktig de stiene ci.yml hopper over (#1477).
// LOCKSTEP: `.github/workflows/ci-docs-noop.yml` — låst av prCard.test.ts.
export const CI_DOCS_WORKFLOW_FILE = 'ci-docs-noop.yml';

export type CiWorkflowRun = { id: number; status: string; conclusion: string | null };

/** Feil (`ok: false`) holdes adskilt fra «ingen kjøring registrert» (`runs: []`) —
 *  kallstedene er fail-closed og må kunne skille dem. */
export type CiRunsLookup = { ok: true; runs: CiWorkflowRun[] } | { ok: false; status: number };

/**
 * Henter kjøringene av `workflowFile` (standard ci.yml) GitHub har registrert for
 * `headSha`. Endepunktet krever FULL 40-tegns SHA — en forkortet SHA gir tom liste.
 */
export async function fetchCiRunsForSha(
  gh: GitHubClient,
  repo: string,
  headSha: string,
  workflowFile: string = CI_WORKFLOW_FILE,
): Promise<CiRunsLookup> {
  const res = await gh.rest(
    'GET',
    `/repos/${repo}/actions/workflows/${workflowFile}/runs?head_sha=${headSha}&per_page=20`,
  );
  if (res.status !== 200) return { ok: false, status: res.status };
  return { ok: true, runs: (res.json as { workflow_runs?: CiWorkflowRun[] }).workflow_runs ?? [] };
}

const FILES_PER_PAGE = 100;
const FILES_MAX_PAGES = 3;

/**
 * Endrede filer i PR-en, eller `null` når vi ikke kan stole på lista: HTTP ≠ 200 eller
 * avkortet av 3×100-taket. `null` MÅ skilles fra `[]` (tom diff) — kallstedene leser
 * `null` som «kode-PR» (fail-closed), ellers slås ci.yml-gaten stille AV (#1520).
 */
export async function fetchChangedFiles(
  gh: GitHubClient,
  repo: string,
  n: number,
): Promise<string[] | null> {
  const files: string[] = [];
  for (let page = 1; page <= FILES_MAX_PAGES; page++) {
    const res = await gh.rest(
      'GET',
      `/repos/${repo}/pulls/${n}/files?per_page=${FILES_PER_PAGE}&page=${page}`,
    );
    if (res.status !== 200) return null;
    const batch = (res.json as Array<{ filename?: string }>) ?? [];
    for (const f of batch) if (f.filename) files.push(f.filename);
    if (batch.length < FILES_PER_PAGE) return files;
  }
  // Siste side var full: det kan finnes flere filer vi ikke har sett (#2835).
  return null;
}
