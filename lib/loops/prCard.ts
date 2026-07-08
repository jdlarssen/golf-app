// Discord merge-kort (#1159, Del A): ren, testbar logikk for GitHub Action-en
// som poster ett kort med merge-knapp per grønn PR. Runneren
// (scripts/loops/post-pr-card.ts) eier HTTP/env; denne modulen eier
// oppsummering-uttrekk, CI-klassifisering og bygging av Discord-meldingen.
//
// Knappens custom_id (`merge_pr:<N>`) mates til det eksisterende
// interactions-endepunktet (app/api/discord/interactions/route.ts, #1124) —
// samme kontrakt, ingen ny mottaker-kode.

// Dedup-label: settes på PR-en når kortet er postet, så check_suite-fyringer
// etterpå ser den og hopper over (ett kort per PR).
export const CARD_LABEL = 'discord:merge-kort';

// Linjer i PR-body-en som ALDRI er oppsummeringen: issue-referanser,
// markdown-overskrifter, bot-/generert-footere, HTML-kommentarer, co-author.
const ISSUE_REF = /^(closes?|closed|fix(es|ed)?|resolves?d?|refs?|part of)\b/i;

function isSkippableLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (ISSUE_REF.test(t)) return true;
  if (t.startsWith('#')) return true; // markdown-overskrift
  if (t.startsWith('🤖')) return true; // bot-markør / «Generated with»-footer
  if (t.startsWith('<!--')) return true; // HTML-kommentar
  if (/^co-authored-by/i.test(t)) return true;
  return false;
}

/**
 * Trekker den norske oppsummeringen ut av PR-body-en: første meningsbærende
 * linje etter at `Closes #N`, overskrifter og støy er hoppet over. Repoets
 * PR-mal er `Closes #N\n\n<tagline fra CHANGELOG>`, så taglinen er allerede
 * forfattet brukercopy — ingen LLM trengs. Null hvis body-en ikke har noe
 * brukbart (f.eks. kun `Closes #N`).
 */
export function extractPrSummary(body: string | null | undefined): string | null {
  if (!body) return null;
  for (const line of body.split('\n')) {
    if (isSkippableLine(line)) continue;
    const trimmed = line.trim();
    // Kutt evt. ledende list-/sitat-markør så kortet blir rent.
    const cleaned = trimmed.replace(/^[-*>]\s+/, '').trim();
    if (cleaned === '') continue;
    return cleaned.length > 300 ? `${cleaned.slice(0, 297)}…` : cleaned;
  }
  return null;
}

export type CheckRun = { status: string; conclusion: string | null };

// Konklusjoner som gjør en check rød (samme sett som merge-endepunktet bruker).
const BAD_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required']);

/**
 * Klassifiserer CI-status for en PR-head ut fra check-runs.
 * - `pending`: minst én check ikke `completed`, ELLER ingen checks registrert
 *   enda (tom liste → carder aldri en PR uten CI).
 * - `red`: minst én fullført check har en dårlig konklusjon.
 * - `green`: alle checks fullført uten dårlig konklusjon.
 */
export function classifyChecks(runs: CheckRun[]): 'pending' | 'red' | 'green' {
  if (runs.length === 0) return 'pending';
  if (runs.some((r) => r.status !== 'completed')) return 'pending';
  if (runs.some((r) => r.conclusion !== null && BAD_CONCLUSIONS.has(r.conclusion))) return 'red';
  return 'green';
}

export type PrForCard = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
};

// Discord message-component-typer (numeriske per API-kontrakten).
const ACTION_ROW = 1;
const BUTTON = 2;
const BUTTON_STYLE_SUCCESS = 3; // grønn
const BUTTON_STYLE_LINK = 5;

export type DiscordButton =
  | { type: 2; style: 3; label: string; custom_id: string }
  | { type: 2; style: 5; label: string; url: string };

export type DiscordMessage = {
  content: string;
  components: Array<{ type: 1; components: DiscordButton[] }>;
};

const DISCORD_CONTENT_MAX = 2000;

/**
 * Bygger Discord-meldingen for ett PR-kort: tittel (+ draft-merkelapp) +
 * oppsummering + PR-lenke som tekst, og én action-row med grønn merge-knapp
 * (`custom_id: merge_pr:<N>`) + en lenke-knapp til PR-en.
 */
export function buildCardPayload({
  pr,
  summary,
}: {
  pr: PrForCard;
  summary: string | null;
}): DiscordMessage {
  const draftBadge = pr.draft ? '📝 Draft · ' : '';
  const lines = [`${draftBadge}**PR #${pr.number}** — ${pr.title}`];
  if (summary) lines.push(summary);
  lines.push(pr.html_url);
  let content = lines.join('\n');
  if (content.length > DISCORD_CONTENT_MAX) {
    content = `${content.slice(0, DISCORD_CONTENT_MAX - 1)}…`;
  }

  return {
    content,
    components: [
      {
        type: ACTION_ROW,
        components: [
          {
            type: BUTTON,
            style: BUTTON_STYLE_SUCCESS,
            label: `✅ Merge PR #${pr.number}`,
            custom_id: `merge_pr:${pr.number}`,
          },
          {
            type: BUTTON,
            style: BUTTON_STYLE_LINK,
            label: 'Åpne PR',
            url: pr.html_url,
          },
        ],
      },
    ],
  };
}
