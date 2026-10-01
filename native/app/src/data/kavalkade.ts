// #2265 PR 2: Kavalkaden i appen, hentet fra webben.
//
// Serveren eier alt som kan bli feil i to utgaver: fakta, datoen, admin-regelen,
// lagringen og AI-innledningen (`lib/kavalkade/getOrCreateKavalkade.ts`). Appen
// spør tre ruter og viser det som kommer tilbake, så det finnes aldri to
// kavalkader for samme spiller, og `KAVALKADE_OPEN_AT` på staging gjelder appen
// også. Kortene bygges av de samme rene funksjonene som på webben
// (`buildKavalkadeDeck`, `buildKavalkadeCardModel`).
//
// - `fetchKavalkadeStatus`: dørene (Rundedagboka og Hjem). Best-effort: feil
//   eller ingen nett gir `null`, og da vises ingen dør.
// - `fetchKavalkade`: kortstokken. Første åpning etter slippet venter på
//   modellen før raden skrives (opptil et minutt). Et kall som ryker, gir
//   `failed`, og neste forsøk leser raden webben har skrevet.
// - `logKavalkadeShare`: teller en deling i `kavalkade_shares`. Best-effort:
//   en feil tar ikke fra spilleren en deling som gikk fint, men den logges.
//
// Utfallene er typede koder (`webApi.ts`); skjermen leser aldri et statusnummer.
import type { KavalkadeFacts } from '../../../../lib/kavalkade/buildKavalkadeFacts';
import type { KavalkadeCardKind } from '../../../../lib/kavalkade/cardModel';
import type { KavalkadeHomeSlot } from '../../../../lib/kavalkade/release';
import { callWebRoute } from './webApi';

/** `GET /api/kavalkade/status`. */
export type KavalkadeStatus = {
  year: number;
  /** Banneret på Hjem: teaser før slippet, lenke etterpå, ellers ingenting. */
  slot: KavalkadeHomeSlot | null;
  /** Åpen for alle, eller admin før slippet (forhåndsvisningen). */
  canOpen: boolean;
  /** Minst én ferdig runde i året; banneret vises bare da. */
  hasRound: boolean;
};

/** `GET /api/kavalkade/{year}`: de tre svarene webbens side også får. */
export type KavalkadeView =
  | { status: 'ready'; facts: KavalkadeFacts; narrative: string | null }
  | { status: 'preview'; facts: KavalkadeFacts }
  | { status: 'closed'; opensAt: string };

export type KavalkadeLoad =
  | { ok: true; view: KavalkadeView }
  | { ok: false; reason: 'offline' | 'failed' };

function isSlot(value: unknown): value is KavalkadeHomeSlot {
  return value === 'teaser' || value === 'link';
}

function isFacts(value: unknown): value is KavalkadeFacts {
  return value !== null && typeof value === 'object' && typeof (value as { rounds?: unknown }).rounds === 'number';
}

export async function fetchKavalkadeStatus(): Promise<KavalkadeStatus | null> {
  const call = await callWebRoute('/api/kavalkade/status', 'GET');
  if (!call.ok || call.status !== 200) {
    if (call.ok || call.reason !== 'offline') {
      console.error('[kavalkade] status feilet', call.ok ? call.status : call.reason);
    }
    return null;
  }
  const { year, slot, canOpen, hasRound } = call.body;
  if (typeof year !== 'number') return null;
  return {
    year,
    slot: isSlot(slot) ? slot : null,
    canOpen: canOpen === true,
    hasRound: hasRound === true,
  };
}

export async function fetchKavalkade(year: number): Promise<KavalkadeLoad> {
  const call = await callWebRoute(`/api/kavalkade/${year}`, 'GET');
  if (!call.ok) return { ok: false, reason: call.reason === 'offline' ? 'offline' : 'failed' };
  const body = call.body;
  if (call.status === 200) {
    if (body.status === 'closed' && typeof body.opensAt === 'string') {
      return { ok: true, view: { status: 'closed', opensAt: body.opensAt } };
    }
    if (body.status === 'preview' && isFacts(body.facts)) {
      return { ok: true, view: { status: 'preview', facts: body.facts } };
    }
    if (body.status === 'ready' && isFacts(body.facts)) {
      const narrative = typeof body.narrative === 'string' ? body.narrative : null;
      return { ok: true, view: { status: 'ready', facts: body.facts, narrative } };
    }
  }
  console.error('[kavalkade] henting feilet', call.status, body.error ?? body.status);
  return { ok: false, reason: 'failed' };
}

export async function logKavalkadeShare(year: number, kind: KavalkadeCardKind): Promise<void> {
  try {
    const call = await callWebRoute(`/api/kavalkade/${year}/share`, 'POST', { cardKind: kind });
    if (call.ok && call.status === 200) return;
    console.error('[kavalkade] delingen ble ikke telt', kind, call.ok ? call.status : call.reason);
  } catch (err: unknown) {
    console.error('[kavalkade] delingen ble ikke telt', kind, err);
  }
}
