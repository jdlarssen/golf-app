// #2259 PR 2: Topplista i appen, hentet fra webben.
//
// Klienten ser bare spillene brukeren selv var med i (RLS, #1542), og brettet
// teller hele Tørny. Serveren eier derfor utregningen: `GET /api/aeresbrett`
// (`app/api/aeresbrett/route.ts`) leser med service-rollen bak innloggingen og
// sender bare tall og kortnavn. Appen viser det som kommer tilbake.
//
// Svaret har tre brett. `boards.birdies` er `null` når bare birdie-lesingen
// feilet; da virker de to andre fanene som vanlig.
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
    isBoard(rounds)
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
