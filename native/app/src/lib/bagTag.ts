// #2256: hva bag-taggen sier om spilleren.
//
// Kortet tegner bare det denne modellen svarer; det regner ingenting selv.
// Tekstene bor i `profileCopy.ts` og er låst mot webben der de finnes.
//
// **Sublinja hopper over det som ikke er satt.** «Dame · Junior · med siden
// 2026» er tre deler, og hver av dem kan mangle: kjønn er valgfritt, «Voksen»
// (`normal`) er standardklassen og sier ingenting om spilleren, og en rad uten
// lesbar `created_at` har ikke noe år å vise. Ingen «ukjent» og ingen dobbel
// prikk der en del mangler.
//
// **Året er enhetens lokaltid**, som resten av appen (Hermes har ikke
// Oslo-sonen).
import { nameInitials } from '../../../../lib/names/initials';
import type { OwnProfile } from '../data/profile';
import {
  PROFILE_TEXT,
  describeHandicapAge,
  formatHcpNb,
  isHandicapAgeStale,
  memberSinceLine,
} from './profileCopy';

export interface BagTagModel {
  /** Klubbnavnet, ellers «Tørny». */
  kicker: string;
  name: string;
  /** «Dame · Junior · med siden 2026», med delene som er satt. Kan være tom. */
  subline: string;
  /** Handicapet klart til visning, `null` for en profil som ikke er fullført. */
  hcpText: string | null;
  /** Ferskheten under handicapet, `null` når det ikke er noe handicap å vise. */
  hcpAge: { stale: boolean; text: string } | null;
  initials: string;
}

const GENDER_LABEL: Record<string, string> = {
  ladies: PROFILE_TEXT.genderFemale,
  mens: PROFILE_TEXT.genderMale,
};

/** `normal` («Voksen») står med vilje ikke her: den vises ikke på kortet. */
const LEVEL_LABEL: Record<string, string> = {
  junior: PROFILE_TEXT.levelJunior,
  senior: PROFILE_TEXT.levelSenior,
};

/** Etiketten for en kjent verdi. `hasOwn`, så «constructor» og slikt ikke slipper gjennom. */
function labelFor(labels: Record<string, string>, value: string | null): string | undefined {
  return value != null && Object.hasOwn(labels, value) ? labels[value] : undefined;
}

function joinYear(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

/**
 * @param club navnet på den første klubben spilleren ble med i, eller `null`.
 * @param email reserve for navnet, som overskriften i profilen alltid har hatt
 *   (#1973): eget navn, ellers e-posten, ellers «Profil».
 */
export function bagTagModel(
  profile: OwnProfile,
  club: string | null,
  now: Date,
  email?: string | null,
): BagTagModel {
  const name =
    profile.name?.trim() || email?.trim() || PROFILE_TEXT.displayNameFallback;

  const year = joinYear(profile.createdAt);
  const subline = [
    labelFor(GENDER_LABEL, profile.gender),
    labelFor(LEVEL_LABEL, profile.level),
    year != null ? memberSinceLine(year) : undefined,
  ]
    .filter((part): part is string => part != null)
    .join(' · ');

  // #1979: uten fullført profil er `hcp_index` bare databasens default (54),
  // ikke et tall spilleren har valgt.
  const hcp = profile.profileCompletedAt == null ? null : profile.hcpIndex;

  return {
    kicker: club?.trim() || PROFILE_TEXT.bagTagFallbackKicker,
    name,
    subline,
    hcpText: hcp != null ? formatHcpNb(hcp) : null,
    hcpAge:
      hcp != null
        ? {
            stale: isHandicapAgeStale(profile.handicapUpdatedAt, now),
            text: describeHandicapAge(profile.handicapUpdatedAt, now),
          }
        : null,
    initials: nameInitials(name),
  };
}
