// ✅-markøren på Utroperens tavle (#1305): `✅ Publisert: <tittel> — YYYY-MM-DD`
// er Utroperens publisert-tilstand (docs/loops/utroperen.md). Formatet har ett
// hjem her, og begge publiseringsstiene stempler via denne modulen:
//
// - Discord-knappen (handlePublishLansering) kaller postLaunchMarker med
//   issue-nummeret fra forslags-kommentaren og bygger kvitteringen av utfallet.
// - /admin/lanseringer (publishProductUpdateAction) kaller stampLaunchBoard.
//
// Best-effort som lib/mail/-helperne: kaster aldri, en feil stopper aldri
// publiseringen — lanseringen er allerede ute når markøren postes.

import type { GitHubClient } from './discordActions';
import { githubClient, LOOP_REPO } from './githubClient';

export const LAUNCH_BOARD_ISSUE = 1208;

// Server-actionen venter på posten før redirect — en treg GitHub skal ikke
// holde admin-siden igjen mer enn dette.
const STAMP_TIMEOUT_MS = 5000;

export type LaunchMarkerOutcome =
  | { ok: true }
  | { ok: false; reason: 'http'; status: number }
  | { ok: false; reason: 'network' };

// Datoen er UTC; Utroperen leser den bare på måned.
export function launchMarkerBody(title: string, now = new Date()): string {
  return `✅ Publisert: ${title} — ${now.toISOString().slice(0, 10)}`;
}

export async function postLaunchMarker(
  gh: GitHubClient,
  issue: number,
  title: string,
): Promise<LaunchMarkerOutcome> {
  try {
    const res = await gh.rest('POST', `/repos/${LOOP_REPO}/issues/${issue}/comments`, {
      body: launchMarkerBody(title),
    });
    if (res.status !== 201) return { ok: false, reason: 'http', status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// Manuell publisering fra /admin/lanseringer. Kun prod stempler: en staging-
// eller preview-publisering på den ekte tavla ville fått Utroperen til å stryke
// en lansering som aldri gikk ut i prod.
export async function stampLaunchBoard(title: string): Promise<void> {
  try {
    if (process.env.VERCEL_ENV !== 'production') {
      console.info('[launchMarker] hoppet over: ikke prod');
      return;
    }
    const pat = process.env.GITHUB_LOOP_PAT;
    if (!pat) {
      console.error('[launchMarker] mangler GITHUB_LOOP_PAT — tavla ble ikke markert');
      return;
    }
    const gh = githubClient(pat, { timeoutMs: STAMP_TIMEOUT_MS });
    const outcome = await postLaunchMarker(gh, LAUNCH_BOARD_ISSUE, title);
    if (!outcome.ok) {
      console.error(
        '[launchMarker] fikk ikke markert tavla:',
        outcome.reason === 'http' ? `HTTP ${outcome.status}` : 'nettverksfeil',
      );
    }
  } catch (err) {
    console.error('[launchMarker] uventet feil', err);
  }
}
