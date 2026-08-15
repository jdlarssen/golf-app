import 'server-only';
import { getServerClient } from '@/lib/supabase/server';

type RosterLike = {
  team1: { userId: string }[];
  team2: { userId: string }[];
};

/**
 * #524 klubb-synlighetsgate — delt av `/cup/[id]` og `/cup/[id]/resultater`
 * (#1468, AGENTS.md-felle 4: én regel, ett hjem). En klubb-scopet cup er kun
 * synlig for klubbens medlemmer, deltakerne og global admin. Snapshot-en bruker
 * admin-client (RLS-bypass), så DENNE gaten — ikke RLS — er det som skjuler
 * klubb-cuper på den lenke-delbare siden. Personlige cuper (`group_id` null) er
 * world-read → alltid tillatt.
 *
 * «Deltaker» betyr det samme her som i cup-lista (`lib/cup/myCups.ts`): rosteret
 * ELLER en `tournament_participants`-rad (#1547). En utkast-cup har ingen
 * `game_players`-rader ennå, så en roster-only-deltaker som ikke (lenger) er
 * klubbmedlem fikk raden i lista men `notFound()` på selve siden — døra og
 * rommet må bruke samme definisjon.
 *
 * @param tournamentId cupen som gates — brukes til `tournament_participants`-
 *   oppslaget.
 * @param proxyUserId allerede-oppslått proxy-bruker-id (`getProxyVerifiedUserId`)
 *   eller null; helperen faller tilbake til `supabase.auth.getUser()` når null.
 */
export async function canViewCupPage({
  tournamentId,
  groupId,
  roster,
  proxyUserId,
}: {
  tournamentId: string;
  groupId: string | null;
  roster: RosterLike;
  proxyUserId: string | null;
}): Promise<boolean> {
  if (!groupId) return true;

  let currentUserId = proxyUserId;
  if (!currentUserId) {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  }

  const isParticipant =
    currentUserId !== null &&
    [...roster.team1, ...roster.team2].some((p) => p.userId === currentUserId);
  if (isParticipant) return true;
  if (!currentUserId) return false;

  const supabase = await getServerClient();
  const [{ data: membership }, { data: profile }, { data: participant }] =
    await Promise.all([
      supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', currentUserId)
        .maybeSingle(),
      supabase
        .from('users')
        .select('is_admin')
        .eq('id', currentUserId)
        .maybeSingle(),
      // Utkast-deltakeren (#1547): rosteret er tomt før spillene finnes, så
      // planens deltakerliste er den eneste sporen av at hen er med.
      // RLS-policyen `tournament_participants_select_authenticated` er
      // `using (true)`, så request-klienten leser den fint.
      supabase
        .from('tournament_participants')
        .select('user_id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', currentUserId)
        .maybeSingle(),
    ]);
  return (
    membership !== null || participant !== null || profile?.is_admin === true
  );
}
