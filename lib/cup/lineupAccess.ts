import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import {
  resolveCupLineupRole,
  type CupLineupRole,
  type CupParticipantRole,
  type CupTeamNumber,
} from './captainRoles';

/**
 * Gaten for kaptein-uttaket (#1884) — «arrangør ELLER kaptein for lag N».
 *
 * Bygget ved siden av `requireAdminOrClubAdminOfCup` (lib/admin/auth.ts), ikke
 * inni den: den gaten redirecter, og uttaks-flyten trenger å kunne SVARE «du er
 * kaptein for lag 2» i stedet for å sende folk til `/`. Kapteiner er ikke
 * admins, så de kan ikke gå gjennom admin-gaten i det hele tatt.
 *
 * Arrangør-definisjonen er nøyaktig den samme som resten av cup-administrasjonen
 * bruker (AGENTS.md-felle 4: én regel, ett hjem):
 *  - global admin, eller
 *  - klubb-cup → klubbens owner/admin, eller
 *  - personlig cup → cupens skaper.
 *
 * ⚠️ Denne gaten ER håndhevelsen. De nye tabellene er deny-by-default (0172,
 * ingen RLS-policyer), så det finnes ingen policy bak som fanger et kall som
 * slipper forbi her — nøyaktig #1542-mønsteret. Alle lese- og skriveveier inn i
 * `cup_lineup_*` MÅ gå gjennom `loadCupLineupAccess` først.
 */
export type CupLineupAccess = {
  userId: string | null;
  isAdmin: boolean;
  groupId: string | null;
  role: CupLineupRole;
  /** Deltakerlista med varige roller — kallerne trenger den uansett. */
  participants: CupParticipantRole[];
};

/**
 * Leser rollen til den innloggede brukeren i denne cupen.
 *
 * Kaster ikke og redirecter ikke: kallerne (server-actions og
 * uttaks-siden) avgjør selv hva `role.kind === 'none'` skal føre til — en
 * action svarer med feilkode, siden redirecter. En ukjent cup gir også `none`,
 * slik at en gjettet cup-id ikke kan skilles fra en cup uten kapteiner.
 */
export async function loadCupLineupAccess(
  tournamentId: string,
): Promise<CupLineupAccess> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const admin = getAdminClient();

  // Admin-client for BEGGE oppslagene: autorisasjons-beslutningen skal ikke
  // avhenge av kallerens egen RLS-sikt. En kaptein ser ikke nødvendigvis
  // cup-radens `created_by`, og en klubb-admin ser ikke fremmede deltaker-rader
  // — leser vi med request-klienten, kollapser rollen til `none` for akkurat de
  // brukerne gaten finnes for.
  const [{ data: cup }, { data: profile }, { data: participantRows }] =
    await Promise.all([
      admin
        .from('tournaments')
        .select('group_id, created_by')
        .eq('id', tournamentId)
        .maybeSingle(),
      userId
        ? admin.from('users').select('is_admin').eq('id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from('tournament_participants')
        .select('user_id, team_number, is_captain')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true }),
    ]);

  const isAdmin = profile?.is_admin === true;
  const groupId = (cup?.group_id as string | null | undefined) ?? null;
  const createdBy = (cup?.created_by as string | null | undefined) ?? null;

  const participants: CupParticipantRole[] = (participantRows ?? []).map(
    (row) => ({
      userId: row.user_id as string,
      teamNumber: ((row.team_number as number | null) ?? null) as
        | CupTeamNumber
        | null,
      isCaptain: row.is_captain === true,
    }),
  );

  let isOrganizer = false;
  if (cup && userId) {
    if (isAdmin) {
      isOrganizer = true;
    } else if (groupId) {
      const { data: membership } = await admin
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .maybeSingle();
      const role = membership?.role as string | undefined;
      isOrganizer = role === 'owner' || role === 'admin';
    } else {
      isOrganizer = createdBy === userId;
    }
  }

  return {
    userId,
    isAdmin,
    groupId,
    role: resolveCupLineupRole({ isOrganizer, participants, userId }),
    participants,
  };
}

/**
 * Får `access` skrive lag `team`s uttak?
 *
 * Arrangøren kan skrive begge lag (nødluka: levere på vegne av en kaptein som
 * ikke rekker det). En kaptein kan KUN skrive sitt eget lag — aldri
 * motstanderens, uansett hvilken vei kallet kommer inn.
 */
export function canWriteTeamLineup(
  access: CupLineupAccess,
  team: CupTeamNumber,
): boolean {
  if (access.role.kind === 'organizer') return true;
  if (access.role.kind === 'captain') return access.role.teamNumber === team;
  return false;
}
