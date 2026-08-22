import 'server-only';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getFormatsForIntent } from '@/lib/formats/getFormatsForIntent';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getFriendConnectionIds } from '@/lib/friends/getFriendConnectionIds';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

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

  return {
    userId,
    courses,
    players,
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
