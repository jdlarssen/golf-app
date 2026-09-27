// native/app/src/lib/teeChoice.ts
// #1859: hvilket tee-sett en spiller starter på i opprett-veiviseren.
//
// **Ingen regel bor her.** Regelen bor i `lib/games/teeChoice.ts` (#2209), som
// webbens veiviser, redigeringsskjemaet, påmeldingsveiene og appen deler. Denne
// fila re-eksporterer den og legger til det ene appen har som webben ikke har:
// tee-ratingene som tre flagg (`TeeRatings`), slik appens data-lag leverer dem.
//
// **`null` betyr «følg profilen», ikke «herre».** Lagret vi profilverdien inn i
// state i stedet, ville en spiller som står i lista før kandidatene er hentet
// blitt stående på herretee til noen oppdaterte raden — nøyaktig kopi-fella
// kommentaren i `CreateGame.tsx` advarer mot.
//
// **Klemmen kjøres ved LESNING.** Banesteget ligger før spillersteget, så en
// spiller som legges til ETTER at teen er valgt ville aldri passert en klem i en
// setter: hen ville stått med et sett teen ikke rater, med chipen deaktivert og
// publiseringen sperret — uten vei ut. Ved lesning gjelder regelen alltid.
import {
  ALL_TEE_GENDERS,
  type TeeGenderAvailability,
} from '../../../../lib/games/teeChoice';

export {
  ALL_TEE_GENDERS,
  defaultTeeGender,
  resolveTeeGender,
  type TeeGenderAvailability,
  type TeeProfile,
} from '../../../../lib/games/teeChoice';

/** Bare den delen av en tee dette handler om — holder fila fri for data-laget. */
export interface TeeRatings {
  hasMens: boolean;
  hasLadies: boolean;
  hasJuniors: boolean;
}

/**
 * Hvilke sett teen faktisk rater. `null` (ingen tee valgt ennå) → alle tre.
 */
export function teeAvailability(tee: TeeRatings | null | undefined): TeeGenderAvailability {
  if (!tee) return ALL_TEE_GENDERS;
  return { M: tee.hasMens, D: tee.hasLadies, J: tee.hasJuniors };
}
