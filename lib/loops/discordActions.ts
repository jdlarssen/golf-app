import crypto from 'node:crypto';
import {
  validateProductUpdateInput,
  type ProductUpdateInputError,
  type ValidatedProductUpdateInput,
} from '@/lib/productUpdates/validateUpdateInput';

// Discord-knappene (#1124): ren, testbar logikk for interactions-endepunktet.
// Route-handleren (app/api/discord/interactions/route.ts) eier HTTP/env;
// denne modulen eier signaturverifisering, custom_id-parsing og GitHub-kallene.
// DB-avhengighetene for publish_lansering (#1207) injiseres via LanseringDeps.

export const LOOP_REPO = 'jdlarssen/golf-app';

// Discord signerer `timestamp + rawBody` med appens ed25519-nøkkel. Node kan
// verifisere natively, men trenger nøkkelen DER-innpakket (SPKI) — Discord
// utleverer kun de rå 32 bytene som hex.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  rawBody: string,
): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signatureHex, 'hex'),
    );
  } catch {
    // Ugyldig hex/nøkkelform = ugyldig signatur — aldri kast videre (fail-closed).
    return false;
  }
}

// Replay-vern: Discord-signaturen dekker tidsstempelet; eldre enn 5 min avvises.
export function isTimestampFresh(timestamp: string, nowMs = Date.now()): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowMs / 1000 - ts) <= 300;
}

export type DiscordAction =
  | { kind: 'merge_pr'; pr: number }
  | { kind: 'ready_issue'; issue: number }
  | { kind: 'answer'; issue: number; choice: 'A' | 'B' }
  | { kind: 'publish_lansering'; commentId: number };

// custom_id-format (satt av sender-siden, se docs/loops/morgenbriefen.md og
// docs/loops/utroperen.md):
//   merge_pr:<n>  ·  ready_issue:<n>  ·  answer:<n>:<A|B>  ·  publish_lansering:<kommentar-id>
export function parseCustomId(customId: string): DiscordAction | null {
  const merge = /^merge_pr:(\d+)$/.exec(customId);
  if (merge) return { kind: 'merge_pr', pr: Number(merge[1]) };

  const ready = /^ready_issue:(\d+)$/.exec(customId);
  if (ready) return { kind: 'ready_issue', issue: Number(ready[1]) };

  const answer = /^answer:(\d+):(A|B)$/.exec(customId);
  if (answer)
    return { kind: 'answer', issue: Number(answer[1]), choice: answer[2] as 'A' | 'B' };

  const publish = /^publish_lansering:(\d+)$/.exec(customId);
  if (publish) return { kind: 'publish_lansering', commentId: Number(publish[1]) };

  return null;
}

// Utroperen (#1207): 📣 Publiser-knappen. Forslaget ligger som tavle-kommentar
// med en maskinlesbar ```json-blokk — knappen bærer kun kommentar-ID-en, siden
// custom_id er maks 100 tegn. DB-operasjonene injiseres så modulen forblir
// enhetstestbar uten Supabase.
export interface LanseringDeps {
  /** Eier-adminens user-id — product_updates.created_by er NOT NULL. Null → ikke publiser. */
  findPublisherUserId(): Promise<string | null>;
  /** Idempotens: samme tittel publisert nylig → dobbel-tapp, ikke publiser på nytt. */
  wasRecentlyPublished(title: string): Promise<boolean>;
  publish(
    input: ValidatedProductUpdateInput & { createdByUserId: string },
  ): Promise<{ recipientCount: number }>;
  /** Lanseringer publisert i inneværende Oslo-måned — kalles ETTER publisering, teller den nye med. */
  countPublishedThisMonth(): Promise<number>;
  /** Månedsetikett til kvitteringen («juli 2026») — beregnes samme sted som månedsvinduet. */
  monthLabel(): string;
}

// Trekker ut og validerer forslags-blokken fra en tavle-kommentar. Samme
// valideringsregler som /admin/lanseringer-skjemaet (én regel, ett hjem).
export function extractLanseringProposal(
  commentBody: string,
):
  | { ok: true; value: ValidatedProductUpdateInput }
  | { ok: false; reason: 'no_block' | 'bad_json' | ProductUpdateInputError } {
  const match = /```json\s*([\s\S]*?)```/.exec(commentBody);
  if (!match) return { ok: false, reason: 'no_block' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { ok: false, reason: 'bad_json' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, reason: 'bad_json' };
  const p = parsed as Record<string, unknown>;
  if (typeof p.title !== 'string' || typeof p.body !== 'string')
    return { ok: false, reason: 'bad_json' };
  if (p.link != null && typeof p.link !== 'string') return { ok: false, reason: 'bad_json' };
  if (p.cta_label != null && typeof p.cta_label !== 'string')
    return { ok: false, reason: 'bad_json' };

  const validated = validateProductUpdateInput({
    title: p.title,
    body: p.body,
    link: (p.link as string | undefined) ?? '',
    cta_label: (p.cta_label as string | undefined) ?? '',
  });
  if (!validated.ok) return { ok: false, reason: validated.error };
  return { ok: true, value: validated.value };
}

// Tynn GitHub-klient så executeAction kan enhetstestes med mock. REST-stier er
// relative til https://api.github.com; `graphql` er eget kall.
export interface GitHubClient {
  rest(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }>;
  graphql(query: string, variables: Record<string, unknown>): Promise<{ status: number; json: unknown }>;
}

// CI-porten leser Actions-workflow-kjøringen for denne fila (ci.yml på main) —
// IKKE check-runs: fine-grained PAT-er kan ikke gis Checks-lesetilgang (det
// finnes ikke som PAT-permission), men «Actions: Read» dekker workflow-runs.
// Endres CI-filnavnet, oppdater her.
const CI_WORKFLOW_FILE = 'ci.yml';

type PrInfo = { node_id: string; draft: boolean; state: string; head: { sha: string } };
type WorkflowRuns = {
  workflow_runs: Array<{ id: number; status: string; conclusion: string | null }>;
};

// Utfører handlingen og returnerer meldingen eieren ser i Discord. Feil fra
// GitHub blir ærlige svar («fikk ikke …: <grunn>») — aldri stille.
// `lansering` er kun nødvendig for publish_lansering; mangler den, svarer
// grenen ærlig i stedet for å kaste.
export async function executeAction(
  action: DiscordAction,
  gh: GitHubClient,
  lansering?: LanseringDeps,
): Promise<string> {
  switch (action.kind) {
    case 'ready_issue': {
      const res = await gh.rest('POST', `/repos/${LOOP_REPO}/issues/${action.issue}/labels`, {
        labels: ['autonomy:ready'],
      });
      if (res.status !== 200)
        return `Fikk ikke merket #${action.issue} (HTTP ${res.status}) — sjekk at issuet finnes og er åpent.`;
      return `🌙 #${action.issue} står i natt-køen — bygges i natt.`;
    }

    case 'answer': {
      const res = await gh.rest('POST', `/repos/${LOOP_REPO}/issues/${action.issue}/comments`, {
        body: `Eierbeslutning via Discord: **${action.choice}**`,
      });
      if (res.status !== 201)
        return `Fikk ikke postet svaret på #${action.issue} (HTTP ${res.status}).`;
      return `✅ Svaret «${action.choice}» er postet på #${action.issue}.`;
    }

    case 'merge_pr': {
      const prRes = await gh.rest('GET', `/repos/${LOOP_REPO}/pulls/${action.pr}`);
      if (prRes.status !== 200) return `Fant ikke PR #${action.pr} (HTTP ${prRes.status}).`;
      const pr = prRes.json as PrInfo;
      if (pr.state !== 'open') return `PR #${action.pr} er ikke åpen (${pr.state}) — ingenting å merge.`;

      const ciRes = await gh.rest(
        'GET',
        `/repos/${LOOP_REPO}/actions/workflows/${CI_WORKFLOW_FILE}/runs?head_sha=${pr.head.sha}&per_page=20`,
      );
      if (ciRes.status !== 200)
        return `Fikk ikke lest CI-status for PR #${action.pr} (HTTP ${ciRes.status}) — ikke merget.`;
      const ciRuns = (ciRes.json as WorkflowRuns).workflow_runs ?? [];
      if (ciRuns.length === 0)
        return `Fant ingen CI-kjøring for PR #${action.pr} enda — prøv igjen når CI har startet.`;
      // Nyeste kjøring (høyeste id) er fasit for head-SHA-en; re-kjøringer gir flere.
      const latest = ciRuns.reduce((a, b) => (b.id > a.id ? b : a));
      if (latest.status !== 'completed')
        return `⏳ CI kjører fortsatt på PR #${action.pr} (${latest.status}) — prøv igjen om litt.`;
      if (latest.conclusion !== 'success')
        return `🔴 CI er ikke grønn på PR #${action.pr} (CI: ${latest.conclusion ?? 'ukjent'}) — ikke merget.`;

      if (pr.draft) {
        const ready = await gh.graphql(
          `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }`,
          { id: pr.node_id },
        );
        if (ready.status !== 200)
          return `Fikk ikke tatt PR #${action.pr} ut av draft (HTTP ${ready.status}) — ikke merget.`;
      }

      // Alltid rebase — squash er forbudt i repoet (mister granulær audit-trail).
      const merge = await gh.rest('PUT', `/repos/${LOOP_REPO}/pulls/${action.pr}/merge`, {
        merge_method: 'rebase',
      });
      if (merge.status !== 200) {
        const detail = (merge.json as { message?: string })?.message ?? `HTTP ${merge.status}`;
        return `Fikk ikke merget PR #${action.pr}: ${detail}`;
      }
      return `✅ PR #${action.pr} er rebase-merget. Issuet med «Closes» lukkes automatisk — closing-kommentaren ligger allerede der.`;
    }

    case 'publish_lansering': {
      if (!lansering)
        return 'Publisering er ikke koblet opp i dette miljøet — publiser manuelt fra /admin/lanseringer.';

      const res = await gh.rest(
        'GET',
        `/repos/${LOOP_REPO}/issues/comments/${action.commentId}`,
      );
      if (res.status !== 200)
        return `Fant ikke forslags-kommentaren (HTTP ${res.status}) — er den slettet? Publiser manuelt fra /admin/lanseringer.`;

      const comment = res.json as { body?: string; issue_url?: string };
      const proposal = extractLanseringProposal(comment.body ?? '');
      if (!proposal.ok) {
        if (proposal.reason === 'no_block' || proposal.reason === 'bad_json')
          return 'Fant ingen gyldig forslags-blokk i kommentaren — publiser manuelt fra /admin/lanseringer.';
        return `Forslaget validerer ikke (${proposal.reason}) — publiser manuelt fra /admin/lanseringer.`;
      }
      const { value } = proposal;

      if (await lansering.wasRecentlyPublished(value.title))
        return `⚠️ «${value.title}» er allerede publisert — ingen ny utsendelse.`;

      const publisherId = await lansering.findPublisherUserId();
      if (!publisherId)
        return 'Fant ingen admin-bruker å publisere som — publiser manuelt fra /admin/lanseringer.';

      const { recipientCount } = await lansering.publish({
        ...value,
        createdByUserId: publisherId,
      });

      // Herfra er lanseringen ute — resten er kvittering og best-effort markør;
      // feil under skal aldri rapportere publiseringen som mislykket.
      const monthCount = await lansering.countPublishedThisMonth().catch(() => null);

      // ✅-markøren på tavle-issuet er Utroperens tilstandssignal («denne er
      // publisert») — issue-nummeret utledes av kommentarens issue_url.
      const issueMatch = /\/issues\/(\d+)$/.exec(comment.issue_url ?? '');
      let markerNote = '';
      if (issueMatch) {
        const marker = await gh.rest(
          'POST',
          `/repos/${LOOP_REPO}/issues/${issueMatch[1]}/comments`,
          { body: `✅ Publisert: ${value.title} — ${new Date().toISOString().slice(0, 10)}` },
        );
        if (marker.status !== 201)
          markerNote = ` (fikk ikke markert tavla: HTTP ${marker.status})`;
      } else {
        markerNote = ' (fant ikke tavle-issuet å markere)';
      }

      const monthNote =
        monthCount !== null && monthCount > 0
          ? ` (lansering nr. ${monthCount} i ${lansering.monthLabel()})`
          : '';
      return `📣 Publisert: «${value.title}» — ute hos ${recipientCount} brukere${monthNote}.${markerNote}`;
    }
  }
}
