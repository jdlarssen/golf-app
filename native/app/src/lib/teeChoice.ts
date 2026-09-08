// native/app/src/lib/teeChoice.ts
// #1859: hvilket tee-sett en spiller starter på i opprett-veiviseren.
//
// **Ingen ny regel bor her.** Begge de to reglene er delt kode: profil-defaulten
// er `playerGenderDefault` (den samme nettsidens veiviser kaller), og klemmen er
// `clampGenderToTee` (løftet ut av webbens hook i samme slipp). Denne fila
// KOMPONERER dem og legger til det ene appen har som webben ikke har: en
// overstyring som kan være «ikke satt».
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
  playerGenderDefault,
  type PlayerLevel,
  type UserGender,
} from '../../../../lib/games/playerGenderDefault';
import {
  clampGenderToTee,
  type TeeGenderAvailability,
} from '../../../../lib/games/clampGenderToTee';
import type { TeeGenderUi } from './wizardPayload';

export type { TeeGenderAvailability };

/** Ingen tee valgt = ingen begrensning ennå. Webbens regel. */
export const ALL_TEE_GENDERS: TeeGenderAvailability = { M: true, D: true, J: true };

/** Feltene profilen bidrar med. Rå DB-strenger, som i `RosterCandidate`. */
export interface TeeProfile {
  gender: string | null;
  level: string | null;
}

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

// `users.gender` og `users.level` kommer inn som rå strenger (`RosterCandidate`
// speiler kolonnene, ikke enumene). Narrowingen står HER, på det ene stedet
// verdiene møter den delte helperen, i stedet for at hver skjerm gjetter.
function asGender(raw: string | null): UserGender {
  return raw === 'mens' || raw === 'ladies' ? raw : null;
}

function asLevel(raw: string | null): PlayerLevel {
  return raw === 'junior' || raw === 'senior' ? raw : 'normal';
}

/**
 * Settet profilen peker på, før klemming. Ukjent profil → herre, som webben.
 */
export function defaultTeeGender(profile: TeeProfile | null | undefined): TeeGenderUi {
  return playerGenderDefault(asGender(profile?.gender ?? null), asLevel(profile?.level ?? null));
}

/**
 * Settet spilleren faktisk spiller fra: arrangørens overstyring hvis den finnes,
 * ellers profilens default — begge klemt til noe teen rater.
 *
 * @param override arrangørens valg, eller `null` for «følg profilen»
 * @param profile kandidatraden, eller `null` når den ikke er hentet ennå
 */
export function resolveTeeGender(
  override: TeeGenderUi | null,
  profile: TeeProfile | null | undefined,
  avail: TeeGenderAvailability,
): TeeGenderUi {
  return clampGenderToTee(override ?? defaultTeeGender(profile), avail);
}
