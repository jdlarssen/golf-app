// #2259 PR 2: Topplista i appen, hentet fra webben.
//
// Klienten ser bare spillene brukeren selv var med i (RLS, #1542), og brettet
// teller hele Tørny. Serveren eier derfor utregningen: `GET /api/aeresbrett`
// (`app/api/aeresbrett/route.ts`) leser med service-rollen bak innloggingen og
// sender bare tall og kortnavn. Appen viser det som kommer tilbake.
//
// Svaret har tre brett og lista `moments` til «Sjeldne slag». `boards.birdies` og `moments` er
// `null` når lesingen av slagene feilet; da virker de to andre fanene som vanlig, og Birdies-fanen
// og kortet sier fra hver for seg.
//
// Utfallet er en typet kode (`webApi.ts`); skjermen leser aldri et statusnummer.
import type { AeresbrettView } from '../../../../lib/stats/appAeresbrettView';
import { callWebRoute } from './webApi';

export type AeresbrettLoad =
  | { ok: true; view: AeresbrettView }
  | { ok: false; reason: 'offline' | 'failed' };

function isRow(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.place === 'number' &&
    typeof row.name === 'string' &&
    typeof row.initials === 'string' &&
    typeof row.count === 'number' &&
    typeof row.isViewer === 'boolean'
  );
}

function isMoment(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    (m.kind === 'hole_in_one' || m.kind === 'albatross' || m.kind === 'eagle') &&
    typeof m.name === 'string' &&
    typeof m.initials === 'string' &&
    typeof m.isViewer === 'boolean' &&
    typeof m.hole === 'number' &&
    (m.courseName === null || typeof m.courseName === 'string') &&
    typeof m.playedOn === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(m.playedOn)
  );
}

function isBoard(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const rows = (value as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.every(isRow);
}

/** Svaret har formen skjermen leser: ellers er det en feil, aldri et halvt brett. */
function isView(body: Record<string, unknown>): boolean {
  const boards = body.boards;
  if (boards === null || typeof boards !== 'object') return false;
  const { wins, birdies, rounds } = boards as Record<string, unknown>;
  return (
    (body.seasonYear === null || typeof body.seasonYear === 'number') &&
    typeof body.seasonOver === 'boolean' &&
    isBoard(wins) &&
    (birdies === null || isBoard(birdies)) &&
    isBoard(rounds) &&
    (body.moments === null || (Array.isArray(body.moments) && body.moments.every(isMoment)))
  );
}

export async function fetchAeresbrett(): Promise<AeresbrettLoad> {
  const call = await callWebRoute('/api/aeresbrett', 'GET');
  if (!call.ok) return { ok: false, reason: call.reason === 'offline' ? 'offline' : 'failed' };
  if (call.status === 200 && isView(call.body)) {
    return { ok: true, view: call.body as unknown as AeresbrettView };
  }
  console.error('[toppliste] henting feilet', call.status, call.body.error);
  return { ok: false, reason: 'failed' };
}
