// Natt-draft-sweepen (#1769), BACKSTOPP: ren, testbar logikk for den daglige
// workflowen som flipper ferdig-bokførte natt-PR-er ut av draft. Runneren
// (scripts/loops/sweep-natt-drafts.ts) eier HTTP/env og selve flippen; denne
// modulen eier klassifiseringen og audit-teksten.
//
// Primærveien er runbook-steget: nattkjøreren kjører `gh pr ready` selv, som
// leveransens SISTE handling (docs/loops/nattkjoreren.md steg 5). Sweepen finnes
// bare for netter som dør mellom bokføringen og den flippen. Derfor er alle
// tvilstilfeller skip: en PR som blir stående er synlig i morgenbriefen, mens en
// feilflippet PR kan auto-merges av kortet.

// Natt-PR-signaturen (verifisert på merged #1750/#1756/#1762): branch-prefiks +
// review-label. Begge MÅ være til stede — interaktive økters drafts bærer ingen
// av delene og skal aldri røres (#1516).
export const NATT_BRANCH_PREFIX = 'claude/natt-';
export const NATT_REVIEW_LABEL = 'autonomy:review';

// Nattkjørerens egne markører (nattkjoreren.md steg 0.3 + steg 5): 🤖 åpner
// leveransekommentaren (bokføringen er gjort), 🔁 åpner ombyggings-kvitteringen
// («Bygger om til alternativ X i natt»).
export const DELIVERY_MARKER = '🤖';
export const REBUILD_MARKER = '🔁';

// Sweepens egen audit-markør. Valgt fordi den (i) ikke er 🤖/🔁 — den skal aldri
// telle som nattkjørerens egen kommentar i steg 0-filteret — og (ii) ikke matcher
// eier-svar-regexen `^\s*alternativ\s*(B|C)\b`. Begge egenskapene er test-låst.
export const SWEEP_MARKER = '🧹';

// Hvor lenge en PR må ha ligget stille før vi tør si at økta er død. 90 min er
// romslig mot en normal leveranse-hale (bokføring + push tar minutter), og kort
// nok til at morgenbriefen ser en flippet PR.
export const MIN_QUIET_MINUTES = 90;

export type NattMarker = typeof DELIVERY_MARKER | typeof REBUILD_MARKER;

export type NattDraftSkipReason =
  | 'ikke-åpen-draft'
  | 'ikke-natt-pr'
  | 'fersk-aktivitet'
  | 'ingen-leveransemarkør'
  | 'uferdig-ombygging';

export type NattDraftDecision =
  | { action: 'flip' }
  | { action: 'skip'; reason: NattDraftSkipReason };

/** Feltene som kan avgjøres uten å hente PR-ens kommentarer (regel 1–3). */
export type NattDraftFacts = {
  isOpen: boolean;
  isDraft: boolean;
  /** `head.ref` — branch-navnet, uten `refs/heads/`. */
  headRef: string;
  labels: string[];
  /** GitHubs `updated_at` (ISO-8601). */
  updatedAt: string;
};

export type NattDraftPr = NattDraftFacts & {
  /** Bodyene til PR-ens issue-kommentarer, i kronologisk rekkefølge (som API-et gir dem). */
  commentBodies: string[];
};

// Minutter siden siste aktivitet. Et tidsstempel vi ikke klarer å lese gir -1 og
// leses dermed som «helt fersk» — fail-closed: vi flipper aldri på et ukjent
// tidspunkt.
function quietMinutes(updatedAt: string, now: Date): number {
  const ts = Date.parse(updatedAt);
  if (Number.isNaN(ts)) return -1;
  return (now.getTime() - ts) / 60_000;
}

/**
 * Portene som ikke trenger kommentarene (regel 1–3), i rekkefølge. `null` = PR-en
 * er fortsatt kandidat. Egen eksport så runneren kan la være å hente kommentarer
 * for PR-er som allerede er ute — regelen har ett hjem (AGENTS.md trap 4):
 * `classifyNattDraft` kaller den samme funksjonen.
 */
export function preCommentSkipReason(pr: NattDraftFacts, now: Date): NattDraftSkipReason | null {
  if (!pr.isOpen || !pr.isDraft) return 'ikke-åpen-draft';
  if (!pr.headRef.startsWith(NATT_BRANCH_PREFIX) || !pr.labels.includes(NATT_REVIEW_LABEL))
    return 'ikke-natt-pr';
  if (quietMinutes(pr.updatedAt, now) < MIN_QUIET_MINUTES) return 'fersk-aktivitet';
  return null;
}

/**
 * Den siste av nattkjørerens markørkommentarer, eller `null` hvis PR-en ikke har
 * noen. Speiler steg 0.3-filteret: markøren teller bare når den ÅPNER kommentaren
 * (ledende blanktegn tillatt) — nevnt midt i en tekst er den bare et tegn.
 */
export function lastNattMarker(commentBodies: string[]): NattMarker | null {
  for (let i = commentBodies.length - 1; i >= 0; i--) {
    const body = commentBodies[i].trimStart();
    if (body.startsWith(DELIVERY_MARKER)) return DELIVERY_MARKER;
    if (body.startsWith(REBUILD_MARKER)) return REBUILD_MARKER;
  }
  return null;
}

/**
 * Skal denne draft-PR-en flippes til ready? Portene i rekkefølge (første treff
 * avgjør):
 *
 * 1. åpen draft — ellers `ikke-åpen-draft`
 * 2. natt-signaturen (branch-prefiks + review-label) — ellers `ikke-natt-pr`
 * 3. stille i ≥ 90 min — ellers `fersk-aktivitet` (økta kan være i arbeid)
 * 4. siste markørkommentar: ingen → `ingen-leveransemarkør` (steg 5 ble aldri
 *    nådd — evaluering eller kryss-modell-gate kan mangle, et menneske må se på
 *    den); 🔁 → `uferdig-ombygging` (nattkjørerens steg 0.5 gjenopptar den)
 * 5. ellers `flip`
 */
export function classifyNattDraft(pr: NattDraftPr, now: Date): NattDraftDecision {
  const pre = preCommentSkipReason(pr, now);
  if (pre) return { action: 'skip', reason: pre };

  const marker = lastNattMarker(pr.commentBodies);
  if (marker === null) return { action: 'skip', reason: 'ingen-leveransemarkør' };
  if (marker === REBUILD_MARKER) return { action: 'skip', reason: 'uferdig-ombygging' };
  return { action: 'flip' };
}

/**
 * Audit-kommentaren sweepen legger igjen etter en flipp. Sier hva som skjedde og
 * at kortets egne porter står — eieren skal aldri lure på om en PR ble flippet av
 * seg selv. Nevner ALDRI 🤖/🔁, heller ikke inne i teksten: steg 0-filteret leser
 * kommentar-åpninger, og en slurvete lesning skal ikke kunne forveksle denne med
 * nattkjørerens egen bokføring.
 */
export function buildSweepComment(): string {
  return [
    `${SWEEP_MARKER} Flippet fra draft av natt-draft-sweepen (#1769) — økta rakk det ikke selv.`,
    '',
    `Leveransekommentaren står og PR-en har ligget stille i over ${MIN_QUIET_MINUTES} minutter, så natta ble ferdig med alt annet enn dette siste håndgrepet.`,
    'Portene i PR-kortet gjelder som før: produktvalg og bruker-synlige endringer uten staging-bevis får merge-knapp i stedet for auto-merge, og rød CI gir ingenting.',
  ].join('\n');
}
