import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
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

  if (!currentUserId) return false;
  if (isOnRoster(roster, currentUserId)) return true;
  const { allowed } = await readCupPageAccess(await getServerClient(), {
    tournamentId,
    groupId,
    roster,
    userId: currentUserId,
  });
  return allowed;
}

/**
 * Samme regel for en bruker fra Bearer-tokenet i appen (#2752), der det ikke
 * finnes noen cookie. `client` leser som kalleren under RLS (`callerScopedClient`).
 * En feilet lesing kaster: databasen som ikke svarer, er ikke et nei.
 */
export async function canViewCupPageAs(
  client: SupabaseClient<Database>,
  input: {
    tournamentId: string;
    groupId: string | null;
    roster: RosterLike;
    userId: string;
  },
): Promise<boolean> {
  if (!input.groupId || isOnRoster(input.roster, input.userId)) return true;
  const { allowed, error } = await readCupPageAccess(client, { ...input, groupId: input.groupId });
  if (error) throw new Error(`canViewCupPageAs: ${error.message}`);
  return allowed;
}

function isOnRoster(roster: RosterLike, userId: string): boolean {
  return [...roster.team1, ...roster.team2].some((p) => p.userId === userId);
}

/** Regelen for en klubb-cup utenfor rosteret: klubben, global admin eller planen. */
async function readCupPageAccess(
  client: SupabaseClient<Database>,
  {
    tournamentId,
    groupId,
    userId,
  }: { tournamentId: string; groupId: string; roster: RosterLike; userId: string },
): Promise<{ allowed: boolean; error: { message: string } | null }> {
  const [membership, profile, participant] = await Promise.all([
    client
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle(),
    client.from('users').select('is_admin').eq('id', userId).maybeSingle(),
    // Utkast-deltakeren (#1547): rosteret er tomt før spillene finnes, så
    // planens deltakerliste er den eneste sporen av at hen er med.
    // RLS-policyen `tournament_participants_select_authenticated` er
    // `using (true)`, så request-klienten leser den fint.
    client
      .from('tournament_participants')
      .select('user_id')
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  return {
    allowed:
      membership.data !== null || participant.data !== null || profile.data?.is_admin === true,
    error: membership.error ?? profile.error ?? participant.error,
  };
}
