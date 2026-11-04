// native/app/src/lib/inboxTarget.ts
// #2759: hvor et trykk i innboksen fører.
//
// Stien kommer fra serverens `notificationDestination`, den samme stien en push
// bærer, og `pushTarget` oversetter den til en skjerm. Da går et trykk på samme
// varsel til samme sted fra push og fra innboksen.
//
// To ting skiller innboksen fra push. En sti appen ikke har skjerm for
// (`/admin/games/{id}/signups`, `/signup/{id}/team`, `/klubber/{id}`) åpner
// nettsiden, der push bare åpner Hjem (eierens svar 02.11). Og uten sti
// (`game_cancelled`, `registration_rejected`) navigerer ikke trykket, det
// merker bare lest.
//
// Ren og I/O-fri (Type A).
import { pushTarget, type ScreenTarget } from './pushRoute';

export type InboxTarget =
  | { kind: 'screen'; target: ScreenTarget }
  | { kind: 'web'; path: string }
  | { kind: 'none' };

export function inboxTarget(destination: string | null): InboxTarget {
  if (destination === null) return { kind: 'none' };
  const target = pushTarget(destination);
  return target.name === 'Home' ? { kind: 'web', path: destination } : { kind: 'screen', target };
}
