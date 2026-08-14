// Auto-merge for Discord-PR-kortet (#1406): ren, testbar logikk for tre-utfalls-
// klassifiseringen og selve mergen. decide-pr-card.ts bruker predikatene +
// `classifyAutoMerge` til å avgjøre om en grønn PR skal auto-merges eller beholde
// knapp-kortet; post-pr-card.ts bruker `mergePullRequest` (injisert GitHub-klient,
// samme mønster som executeAction) + `dispatchMainVerify` på suksess-stien.
//
// Bruker-synlig-porten og staging-porten gjenbruker etablerte hjem (commit-prefiks
// §T7 og `staging-verified`-labelen #1076) — ingen ny heuristikk.

import { classifyChecks, type CheckRun } from './prCard';
import { type GitHubClient } from './discordActions';

// ── Aldri-lista ──────────────────────────────────────────────────────────────

// Flater som ALDRI auto-merges — de beholder menneske-porten (knapp-kort). Bredere
// enn issue-ets liste (fail-closed): hele supabase/ + app/api/ + enforcement-flatene
// (#1406, §3). Håndrullet glob-match (à la isVisualChange) — ingen ny dependency.
export const NEVER_AUTO_MERGE_GLOBS = [
  'supabase/**', // migrasjoner (prod-brannmur #1074), RLS, DB-config
  '**/slett/**', // destruktive flyter
  '**/slett-konto/**',
  'proxy.ts', // auth-/sikkerhetsflater
  'lib/auth/**',
  'lib/supabase/**',
  'app/api/**',
  'app/[locale]/(auth)/**',
  '**/betaling/**', // koster penger
  'lib/payment/**',
  '.github/**', // enforcement-/guard-rail-flater
  '.githooks/**',
  '.claude/**',
] as const;

// Tre glob-former: `**/mid/**` (katalog hvor som helst), `prefix/**` (under prefiks),
// og eksakt filnavn. `[locale]`/`(auth)` er literale sti-segmenter — ikke regex.
function matchesGlob(file: string, glob: string): boolean {
  if (glob.startsWith('**/') && glob.endsWith('/**')) {
    const mid = glob.slice(3, -3);
    return `/${file}`.includes(`/${mid}/`);
  }
  if (glob.endsWith('/**')) {
    const prefix = glob.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  return file === glob;
}

// Minst én endret fil rører aldri-lista.
export function touchesNeverList(files: string[]): boolean {
  return files.some((f) => NEVER_AUTO_MERGE_GLOBS.some((g) => matchesGlob(f, g)));
}

// ── Valg-markør ──────────────────────────────────────────────────────────────

export const NEEDS_DECISION_LABEL = 'autonomy:needs-decision';

// Maskin-markøren for produktvalg: en markdown-heading «## Produktvalg» eller
// «## Alternativ A/B» (a–e) i PR-body-en. Prosa som «Alternativer vurdert» uten
// heading teller IKKE — konvensjonen naglet i CLAUDE.md steg 5.
const CHOICE_MARKER = /^#{1,6}\s+(produktvalg\b|alternativ\s+[a-e]\b)/im;

export function hasChoiceMarker(body: string | null | undefined): boolean {
  return body != null && CHOICE_MARKER.test(body);
}

// Lenkede issues i PR-body-en (`closes|fixes|resolves|refs|part of #N`) — samme
// nøkkelord-sett som prCard.ISSUE_REF, her som global uttrekk av numrene. Decide
// slår opp labelene på disse for autonomy:needs-decision.
const ISSUE_LINK = /\b(?:closes?|closed|fix(?:es|ed)?|resolves?|resolved|refs?|part of)\s+#(\d+)/gi;

export function linkedIssueNumbers(body: string | null | undefined): number[] {
  if (!body) return [];
  const nums = new Set<number>();
  for (const m of body.matchAll(ISSUE_LINK)) nums.add(Number(m[1]));
  return [...nums];
}

// ── Bruker-synlig (staging-porten) ───────────────────────────────────────────

export const STAGING_VERIFIED_LABEL = 'staging-verified';

// Bruker-synlig = commit-prefiks-regelen (§T7, commit-msg-hooken): ≥1 commit med
// feat|fix|perf-prefiks der meldingen IKKE har `[no-changelog]`-escapen. Any-kvantor:
// én ren feat uten escape er nok, selv om andre commits er `[no-changelog]`.
const USER_VISIBLE_PREFIX = /^(?:feat|fix|perf)(?:\([^)]*\))?!?:/i;

export function isUserVisibleByCommits(commitMessages: string[]): boolean {
  return commitMessages.some((msg) => {
    const subject = (msg.split('\n')[0] ?? '').trim();
    if (!USER_VISIBLE_PREFIX.test(subject)) return false;
    return !msg.includes('[no-changelog]');
  });
}

// ── Klassifisering ───────────────────────────────────────────────────────────

export type AutoMergeInput = {
  baseRef: string;
  title: string;
  body: string | null | undefined;
  changedFiles: string[];
  commitMessages: string[];
  prLabels: string[];
  /** Minst ett lenket issue har autonomy:needs-decision (slås opp av decide — ikke rent). */
  needsDecisionIssue: boolean;
};

export type AutoMergeClassification = {
  outcome: 'auto-merge' | 'card';
  /** Hvilken port som degraderte auto-merge → card (kun logging/observability). */
  demotedReason: string | null;
};

const WIP_RE = /\bwip\b/i;

// Portrekkefølge (første treff avgjør), jf. §1: base ≠ main → WIP → aldri-lista →
// valg-markør (heading ELLER lenket-issue-label) → staging-porten → ellers auto-merge.
export function classifyAutoMerge(input: AutoMergeInput): AutoMergeClassification {
  if (input.baseRef !== 'main')
    return { outcome: 'card', demotedReason: `base-branch «${input.baseRef}» ≠ main` };
  if (WIP_RE.test(input.title)) return { outcome: 'card', demotedReason: 'WIP i tittel' };
  if (touchesNeverList(input.changedFiles))
    return { outcome: 'card', demotedReason: 'endrer fil på aldri-lista' };
  if (hasChoiceMarker(input.body))
    return { outcome: 'card', demotedReason: 'produktvalg-markør i PR-body' };
  if (input.needsDecisionIssue)
    return { outcome: 'card', demotedReason: 'lenket issue har autonomy:needs-decision' };
  if (isUserVisibleByCommits(input.commitMessages) && !input.prLabels.includes(STAGING_VERIFIED_LABEL))
    return { outcome: 'card', demotedReason: 'bruker-synlig uten staging-verified' };
  return { outcome: 'auto-merge', demotedReason: null };
}

// ── Merge-mekanikk (post-steget) ─────────────────────────────────────────────

export type MergeOutcome = { ok: true } | { ok: false; reason: string };

type ReFetchedPr = {
  state: string;
  draft: boolean;
  head: { sha: string };
};

/**
 * Merger PR-en fail-closed (§2): re-verifiser åpen + ikke draft + check-runs
 * grønne mot `headSha`, og `PUT …/merge` med rebase + `sha`-guard (409 ved nye
 * commits). Enhver feil returnerer `{ok:false, reason}` så post-steget kan
 * falle tilbake til knapp-kortet — aldri stille drop.
 * Egen helper fremfor executeAction/merge_pr: mottakerens CI-port leser kun
 * ci.yml-runs og ville avvist docs-only-PR-er som bare har Vercel-checks.
 */
export async function mergePullRequest({
  gh,
  repo,
  prNumber,
  headSha,
}: {
  gh: GitHubClient;
  repo: string;
  prNumber: number;
  headSha: string;
}): Promise<MergeOutcome> {
  const prRes = await gh.rest('GET', `/repos/${repo}/pulls/${prNumber}`);
  if (prRes.status !== 200) return { ok: false, reason: `PR-oppslag feilet (HTTP ${prRes.status})` };
  const pr = prRes.json as ReFetchedPr;
  if (pr.state !== 'open') return { ok: false, reason: `PR ikke lenger åpen (${pr.state})` };
  // Draft-først (#1516): en draft er «økta jobber fortsatt» — kortet av-drafter ALDRI.
  // Decide noop-er drafts, så dette er race-guarden (re-draftet etter decide) →
  // fail-closed fallback til knapp-kortet. (Eier-knappen/mottakeren av-drafter fortsatt —
  // et eier-trykk ER menneskeporten.)
  if (pr.draft) return { ok: false, reason: 'PR er draft — økta jobber fortsatt' };

  const checkRes = await gh.rest('GET', `/repos/${repo}/commits/${headSha}/check-runs?per_page=100`);
  if (checkRes.status !== 200)
    return { ok: false, reason: `check-runs-oppslag feilet (HTTP ${checkRes.status})` };
  // `name` er med fordi classifyChecks filtrerer bort kortets egen post-card-check
  // (#1520) — uten navnet ville en kansellert kortkjøring lest som rød her.
  const runs = ((checkRes.json as { check_runs?: CheckRun[] }).check_runs ?? []).map((r) => ({
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
  }));
  const state = classifyChecks(runs);
  if (state !== 'green') return { ok: false, reason: `CI ${state} ved re-sjekk` };

  // Alltid rebase — squash er forbudt i repoet. `sha`-param gir 409 om head har
  // fått nye commits siden decide (race-guard).
  const merge = await gh.rest('PUT', `/repos/${repo}/pulls/${prNumber}/merge`, {
    merge_method: 'rebase',
    sha: headSha,
  });
  if (merge.status !== 200) {
    const detail = (merge.json as { message?: string })?.message ?? `HTTP ${merge.status}`;
    return { ok: false, reason: `merge feilet: ${detail}` };
  }
  return { ok: true };
}

// ── main-verify-dispatch ─────────────────────────────────────────────────────

// En GITHUB_TOKEN-merge trigger ALDRI main-verify.yml via push (anti-rekursjon),
// så #1075-nettet må dispatches eksplisitt — MED MINDRE alle endrede filer matcher
// main-verifys egne ignore-globs (`**.md`, `docs/**`, `.forge/**`): en slik merge
// kan ikke komponere rød main.
function matchesMainVerifyIgnore(file: string): boolean {
  return file.endsWith('.md') || file.startsWith('docs/') || file.startsWith('.forge/');
}

export function shouldDispatchMainVerify(changedFiles: string[]): boolean {
  return !changedFiles.every(matchesMainVerifyIgnore);
}

export async function dispatchMainVerify(
  gh: GitHubClient,
  repo: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await gh.rest(
    'POST',
    `/repos/${repo}/actions/workflows/main-verify.yml/dispatches`,
    { ref: 'main' },
  );
  return { ok: res.status === 204, status: res.status };
}
