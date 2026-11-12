// native/app/src/data/clubOptions.ts
// #2753: hva «Klubb-turnering» trenger — om flisen vises, klubbene og
// medlemmene. Serveren avgjør med nettets regel (`GET /api/games/club-options`).
//
// Hentingen KASTER ved feil, som de andre lesingene i veiviseren (`useRemote`).
// Veiviseren leser en feil som «ingen flis», slik nettet gjør når oppslaget
// feiler: en blindvei er verre enn en flis som mangler.
import type { AppClubOptions } from '../../../../lib/clubs/appClubOptionsView';
import { callWebRoute } from './webApi';

export async function fetchClubOptions(): Promise<AppClubOptions> {
  const call = await callWebRoute('/api/games/club-options', 'GET');
  if (!call.ok) throw new Error(`fetchClubOptions: ${call.reason}`);
  if (call.status !== 200) throw new Error(`fetchClubOptions: status ${call.status}`);
  const body = call.body as Partial<AppClubOptions>;
  if (
    typeof body.canCreateClubGame !== 'boolean' ||
    !Array.isArray(body.clubs) ||
    typeof body.membersByClub !== 'object' ||
    body.membersByClub === null
  ) {
    throw new Error('fetchClubOptions: uventet svar');
  }
  return body as AppClubOptions;
}
