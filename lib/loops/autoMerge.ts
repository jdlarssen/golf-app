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

// Maskin-markøren for produktvalg. Den leses BÅDE i PR-body-en og i PR-ens
// kommentarer (#1656): CLAUDE.md §«PR-presentasjon» tillater fordeler/ulemper «i body
// eller første kommentar», og nattkjøreren (docs/loops/nattkjoreren.md steg 5) gjengir
// hele alternativ-seksjonen i PR-KOMMENTAREN. Leste porten bare body-en, ble et ekte
// produktvalg auto-merget forbi eieren — samme utfall som #1623, annen vei inn.
// Body er fortsatt den foreskrevne primærplassen for økter; kommentar-lesningen er
// nettet under.
//
// To former teller:
//
//   1. en markdown-heading som INNEHOLDER ordet «produktvalg» — «## Produktvalg»,
//      «## Alternativer (produktvalg)», «## ⚖️ Produktvalg»;
//   2. en heading som STARTER med «Alternativ A»–«Alternativ E».
//
// Prosa uten heading teller IKKE («Alternativer vurdert: A og B» forblir false).
//
// #1623: form 1 krevde tidligere at headingen startet med «produktvalg», mens
// mal-teksten i CLAUDE.md foreskrev «## Alternativer (produktvalg)». De to
// motsa hverandre, og PR #1620 — et ekte produktvalg — ble auto-merget forbi
// eieren. «alternativ» må fortsatt stå først OG følges av a–e: å matche
// «alternativ» hvor som helst ville truffet «## Vurderte alternativer» i rene
// tekniske PR-er. Regelen har FEM hjem: her, scripts/loops/decide-pr-card.ts
// (henteren), CLAUDE.md steg 5, docs/loops/discord-pr-kort.md og
// docs/loops/nattkjoreren.md steg 5 — endres den her, endres den der.
//
// Bevisst fail-closed: «## Ingen produktvalg» matcher også. Kostnaden er en
// menneske-merge; alternativet er en tapt eier-beslutning. Ikke forsøk å
// utelukke negasjoner.
//
// Detaljer som ser vilkårlige ut, men ikke er det:
//   · ingen `\b` ETTER «produktvalg» — bestemt form («## Produktvalget»,
//     «## Produktvalgene») er idiomatisk norsk, og regelen over lover en heading
//     som INNEHOLDER ordet. Med ordgrense ville doccen lovet mer enn koden ga —
//     samme drift som #1623 selv kom av, bare smalere.
//   · `[ \t]` og ikke `\s` mellom `#` og teksten: `\s` krysser linjeskift, så
//     «##\nEt produktvalg» ble lest som en heading.
//   · `(?=([ \t]+))\1` er ikke pynt — det er atomisk gruppering, emulert med
//     lookahead + backreference (JS har ikke `(?>…)`). Uten den kan motoren
//     backtracke inn i mellomrom-løpet for hvert startpunkt `.*` prøver, og
//     matchingen blir kvadratisk: en body på «#» + 65k mellomrom brukte ~3 s,
//     mot 0,12 ms med atomisk gruppe. GitHub tillater 65 536 tegn i en body, så
//     taket er reelt. Skriv den IKKE om til et vanlig `[ \t]+`.
const CHOICE_MARKER =
  /^#{1,6}(?=([ \t]+))\1(?:.*\bproduktvalg|alternativ[ \t]+[a-e]\b)/im;

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

// KUN GitHubs closing-nøkkelord (close/fix/resolve + s/d-formene). Bevisst smalere
// enn ISSUE_LINK: `refs #N` / `part of #N` betyr «beslektet», ikke «levert», og en
// lukking basert på dem ville drept levende issues. De to settene har derfor hver
// sin regex — ikke slå dem sammen (#1634).
const CLOSING_LINK = /\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#(\d+)/gi;

export function closingIssueNumbers(body: string | null | undefined): number[] {
  if (!body) return [];
  const nums = new Set<number>();
  for (const m of body.matchAll(CLOSING_LINK)) nums.add(Number(m[1]));
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
  /**
   * Bodyene til PR-ens issue-kommentarer (#1656). Valg-markøren leses her i tillegg
   * til `body`. Kortets/nattkjørerens EGNE kommentarer teller med — en markør de har
   * skrevet er nettopp et valg eieren skal ta. Feiler henteren, skal PR-en aldri
   * auto-merges (fail-closed i decide-pr-card.ts, ikke her).
   */
  commentBodies: string[];
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
// valg-markør (heading i body ELLER kommentar ELLER lenket-issue-label) →
// staging-porten → ellers auto-merge.
export function classifyAutoMerge(input: AutoMergeInput): AutoMergeClassification {
  if (input.baseRef !== 'main')
    return { outcome: 'card', demotedReason: `base-branch «${input.baseRef}» ≠ main` };
  if (WIP_RE.test(input.title)) return { outcome: 'card', demotedReason: 'WIP i tittel' };
  if (touchesNeverList(input.changedFiles))
    return { outcome: 'card', demotedReason: 'endrer fil på aldri-lista' };
  if (hasChoiceMarker(input.body) || input.commentBodies.some(hasChoiceMarker))
    return { outcome: 'card', demotedReason: 'produktvalg-markør i PR-body/kommentar' };
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

// ── Eksplisitt issue-lukking etter merge ─────────────────────────────────────

export type CloseIssuesResult = {
  /** Issues denne kjøringen faktisk lukket. */
  closed: number[];
  /** Issues som allerede sto lukket — hoppet over (aldri reopen). */
  alreadyClosed: number[];
  /** Issues vi ikke fikk lukket (oppslag/PATCH feilet eller kastet). */
  failed: number[];
};

/** Kommentaren som følger en kort-lukking — sporet tilbake til #1634 og til plikten
 * om en ekte closing-kommentar (Teknisk/Funksjonell) fra økta som eide PR-en. */
export function closeIssueComment(prNumber: number): string {
  return [
    `Lukket av PR-kortet etter merge av PR #${prNumber} — GitHubs auto-close fyrer ikke på workflow-merger (#1634).`,
    'Closing-kommentar (Teknisk/Funksjonell) gjenstår for økta som eide PR-en.',
    '',
    '---',
    '_Generated by [Claude Code](https://claude.ai/code)_',
  ].join('\n');
}

/**
 * Lukker issuene PR-body-en lovet å lukke (#1634). GitHubs egen auto-close fyrer
 * IKKE når mergen kommer fra en workflow-identitet (GITHUB_TOKEN) — 6 av 6 kort-
 * merger etterlot issuet åpent, med duplikat-bygg som konsekvens. Kortet gjør
 * derfor jobben selv.
 *
 * Best-effort per issue: GET-en er reopen-guarden (allerede lukket → hopp over),
 * og enhver feil logges og lar løpet fortsette til neste nummer — en tapt lukking
 * skal aldri felle en gjennomført merge.
 */
export async function closeLinkedIssues({
  gh,
  repo,
  issues,
  prNumber,
  logError = (msg: string) => console.error(msg),
}: {
  gh: GitHubClient;
  repo: string;
  issues: number[];
  prNumber: number;
  logError?: (msg: string) => void;
}): Promise<CloseIssuesResult> {
  const result: CloseIssuesResult = { closed: [], alreadyClosed: [], failed: [] };

  for (const n of issues) {
    try {
      const current = await gh.rest('GET', `/repos/${repo}/issues/${n}`);
      if (current.status !== 200) {
        logError(`#${n}: fikk ikke lest issuet (HTTP ${current.status}) — ikke lukket.`);
        result.failed.push(n);
        continue;
      }
      if ((current.json as { state?: string }).state === 'closed') {
        result.alreadyClosed.push(n);
        continue;
      }

      const close = await gh.rest('PATCH', `/repos/${repo}/issues/${n}`, {
        state: 'closed',
        state_reason: 'completed',
      });
      if (close.status !== 200) {
        logError(`#${n}: lukking feilet (HTTP ${close.status}) — lukk manuelt på GitHub.`);
        result.failed.push(n);
        continue;
      }
      result.closed.push(n);

      const comment = await gh.rest('POST', `/repos/${repo}/issues/${n}/comments`, {
        body: closeIssueComment(prNumber),
      });
      if (comment.status !== 201)
        logError(`#${n}: lukket, men lukke-kommentaren feilet (HTTP ${comment.status}).`);
    } catch (err) {
      logError(`#${n}: lukking kastet — ${String(err)}`);
      result.failed.push(n);
    }
  }

  return result;
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
