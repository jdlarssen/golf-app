import 'server-only';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFormatsForIntent } from '@/lib/formats/getFormatsForIntent';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getFriendConnectionIds } from '@/lib/friends/getFriendConnectionIds';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { orderPickerPlayers, pickerStatsIds } from '@/lib/wizard/pickerOrder';
import { getPickerOrderStats } from '@/lib/wizard/pickerOrderStats';
import { getCreateGamePlayerRoster } from '@/lib/games/getCreateGamePlayerRoster';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';

/**
 * Alt `GameWizard` trenger for å mountes, hentet på serveren.
 *
 * Delt av begge veiviser-flatene (#1385): opprett-ruta
 * (`/admin/games/[id]/../new`) og gjenoppta-utkast-grenen på admin sin
 * rediger-rute. Samlet her fremfor kopiert, så en ny prop veiviseren trenger
 * ikke kan lande på én flate og mangle på den andre.
 *
 * Alle kildene er server-only mot samme cookie-scopede klient, og
 * format-katalogene ligger bak `unstable_cache` (24t), så oppslaget er billig.
 * Venne- og klubb-oppslagene er best-effort: en feil der skal ikke ta ned
 * veiviseren, den gjør bare spiller-velgeren tommere.
 */
export async function getWizardMountData() {
  const userId = await getProxyVerifiedUserId();

  // Forhåndshent format-katalogen for alle tre ikke-cup-intents så
  // klient-veiviseren kan switche intent uten ekstra fetch.
  const [kompisFormats, klubbFormats, soloFormats, formatGuide] =
    await Promise.all([
      getFormatsForIntent('kompis'),
      getFormatsForIntent('klubb'),
      getFormatsForIntent('solo'),
      getFormatGuideEntries(),
    ]);

  const [{ courses, players, clubs }, friendPlayerIds, clubMembers] =
    await Promise.all([
      getNewGameFormData(),
      // #464: venne-relasjonene til brukeren — picker-kilde for kompis/cup.
      // Inkluderer pending forespørsler (begge retninger) så folk du nettopp
      // har sendt forespørsel til kan velges. Best-effort — tom liste ved feil.
      userId ? getFriendConnectionIds(userId).catch(() => []) : Promise.resolve([]),
      // #464: klubbmedlemmer — picker-kilde for klubb-intent. Admin-rosteren
      // (hele basen) inneholder allerede medlemmene, så vi trenger bare id-mappet.
      userId
        ? getClubMemberPlayerOptions(userId).catch(() => ({
            memberIdsByClub: {},
            options: [],
          }))
        : Promise.resolve({ memberIdsByClub: {}, options: [] }),
    ]);

  // #2321: the picker's order — you first, then the people you last played
  // with. Only friends and club members are looked up: the admin roster is the
  // whole user base, the same bounded id set `/opprett-spill` sends. Best-effort,
  // an empty map leaves name order.
  const stats = userId
    ? await getPickerOrderStats(
        userId,
        pickerStatsIds({
          friendPlayerIds,
          clubMemberIdsByClub: clubMembers.memberIdsByClub,
          selfId: userId,
        }),
      )
    : new Map();

  return {
    userId,
    courses,
    players: orderPickerPlayers(players, stats, userId ?? ''),
    clubs,
    formatsByIntent: {
      kompis: kompisFormats,
      klubb: klubbFormats,
      solo: soloFormats,
    },
    formatGuide,
    friendPlayerIds,
    clubMemberIdsByClub: clubMembers.memberIdsByClub,
  };
}

/**
 * The same for an organiser who is not admin: `/opprett-spill`, and resuming a
 * draft on `/games/[id]/rediger` (#2269). The picker is co-players ∪ friends ∪
 * club members without e-mail (`getCreateGamePlayerRoster`, #464/#2018), and
 * `isClubAdmin` decides whether the «Klubb-turnering» tile shows (#525). One
 * home, so the two organiser surfaces cannot drift apart.
 */
export async function getOrganiserWizardMountData(userId: string) {
  // F2 (#272): pre-fetch format-katalog parallelt med courses/players.
  const [kompisFormats, klubbFormats, soloFormats, formatGuide] = await Promise.all([
    getFormatsForIntent('kompis'),
    getFormatsForIntent('klubb'),
    getFormatsForIntent('solo'),
    getFormatGuideEntries(),
  ]);
  const [{ courses, players, clubs, friendPlayerIds, clubMemberIdsByClub }, isClubAdmin] =
    await Promise.all([
      // #464/#2018: medspillere ∪ venner ∪ klubbmedlemmer, samme cachede liste som
      // PlayerShortageBanner på /opprett-spill teller — så banneret og velgeren
      // aldri er uenige.
      getCreateGamePlayerRoster(userId),
      isClubAdminAnywhere(userId),
    ]);
  return {
    userId,
    courses,
    players,
    clubs,
    friendPlayerIds,
    clubMemberIdsByClub,
    isClubAdmin,
    formatsByIntent: {
      kompis: kompisFormats,
      klubb: klubbFormats,
      solo: soloFormats,
    },
    formatGuide,
  };
}
