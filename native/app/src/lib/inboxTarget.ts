// native/app/src/lib/inboxTarget.ts
// #2759: hvor et trykk i innboksen tar deg. Ren og I/O-fri (Type A).
//
// Serveren sender stien fra `notificationDestination`, og `pushTarget` sier hvilken
// skjerm den er, så et varsel går til samme sted fra push og fra innboks. Et mål
// som ender på `Home` uten å være tomt, er en side appen ikke har (arrangørens
// påmeldinger, klubben): den åpnes i nettleseren (eierens svar 02.11: «Ja, vis
// alle»). Påmeldingssiden (`/signup/…`) åpner appens påmeldingsskjerm, og lagvarslene
// (`/signup/…/team`) lagsiden (#2840). Uten sti er det ingen steder å gå, og trykket
// merker bare raden lest.
import type { ScreenTarget } from './openPushTarget';
import { pushTarget } from './pushRoute';

export type InboxTarget =
  | { kind: 'none' }
  | { kind: 'screen'; target: ScreenTarget }
  | { kind: 'web'; path: string };

export function inboxTarget(destination: string | null): InboxTarget {
  if (!destination) return { kind: 'none' };
  const target = pushTarget(destination);
  return target.name === 'Home' ? { kind: 'web', path: destination } : { kind: 'screen', target };
}
