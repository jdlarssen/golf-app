// native/app/src/lib/ownerGateCopy.ts
// Native #1959: tekstene eier-porten i `App.tsx` viser når wipen kastet ved
// eierbytte.
//
// Samme arbeidsdeling som de andre `*Copy.ts`: skjermen viser, teksten bor her.
// Setningen og «Prøv igjen» er webbens (`messages/no.json → SyncBanner`) tegn
// for tegn, og `ownerGateCopy.test.ts` låser det: den samme sperren skal
// forklares likt på begge flater. «Logg ut» og feilnotatene er profil-rommets
// egne, så utloggingen høres lik ut uansett hvor spilleren trykker.
import { PROFILE_TEXT } from './profileCopy';

export const OWNER_GATE_TEXT = {
  /** Webbens `SyncBanner.ownerWipeFailed`. */
  wipeFailed:
    'Telefonen har fortsatt slag fra forrige bruker, og appen fikk ikke fjernet dem. Ingen slag sendes før det er gjort. Prøv igjen, eller logg ut.',
  /** Webbens `SyncBanner.retry`. */
  retry: 'Prøv igjen',
  logout: PROFILE_TEXT.logout,
  logoutPending: PROFILE_TEXT.logoutPending,
  logoutFailedNote: PROFILE_TEXT.logoutFailedNote,
  logoutOfflineNote: PROFILE_TEXT.logoutOfflineNote,
} as const;
