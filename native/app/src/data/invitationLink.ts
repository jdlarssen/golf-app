// native/app/src/data/invitationLink.ts
// #2748: invitasjonsmailen åpnet appen, og serveren åpner invitasjonen. Å åpne er å
// bekrefte, som på nettsiden. Reglene for hva den gir, står på serveren
// (`lib/auth/openInvitation.ts`), og et kall til gir samme svar og ingen ny rad.
//
// **Wire-kontrakten** (ruta og denne fila endres i samme PR):
//   POST /api/invitasjon/{token}  200 { status: 'in_game', gameId } ·
//        200 { status: 'started' | 'no_game' | 'other_account' } · 401 · 404 · 500
//
// Utfallene er TYPEDE koder, aldri bruker-tekst. Teksten bor i
// `lib/invitationLinkCopy.ts`. Går ALDRI i sync-køen: uten nett stopper den før kallet.
import { callWebRoute, type WebApiFailure } from './webApi';

/** Det som gjør at vi ikke vet noe, og kan prøve igjen. */
export type InvitationLinkFailure = WebApiFailure | 'open_failed';

/** Svar som er endelige: de har hver sin tekst, og å prøve igjen hjelper ikke. */
export type InvitationLinkOutcome = 'started' | 'no_game' | 'other_account' | 'not_found';

export type InvitationLinkResult =
  | { ok: true; gameId: string }
  | { ok: false; outcome: InvitationLinkOutcome }
  | { ok: false; reason: InvitationLinkFailure };

export async function openInvitationLink(token: string): Promise<InvitationLinkResult> {
  const call = await callWebRoute(`/api/invitasjon/${encodeURIComponent(token)}`, 'POST');
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status === 404) return { ok: false, outcome: 'not_found' };
  if (call.status !== 200) return { ok: false, reason: 'open_failed' };
  const { status, gameId } = call.body;
  if (status === 'in_game' && typeof gameId === 'string' && gameId !== '') return { ok: true, gameId };
  if (status === 'started' || status === 'no_game' || status === 'other_account') {
    return { ok: false, outcome: status };
  }
  return { ok: false, reason: 'open_failed' };
}
