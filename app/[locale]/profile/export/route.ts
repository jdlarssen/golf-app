import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { emailMatchPattern } from '@/lib/supabase/emailMatch';

// One fixed text for every failed read (#2333): the export either carries
// all of the user's data or nothing, and never leaks error.message.
const EXPORT_FAILED = 'Klarte ikke å hente dataene dine. Prøv igjen om litt.';

function exportFailed(read: string, error: unknown) {
  console.error(`[profile/export] ${read} failed`, error);
  return NextResponse.json({ error: EXPORT_FAILED }, { status: 500 });
}

export async function GET() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  }

  try {
    const supabase = await getServerClient();

    // 1. public.users — the user's own row. Admin client (#2207): users.email
    //    and friend_code are not readable through the user's own session, and
    //    the export carries every column, future ones included. The id is the
    //    proxy-verified one above. A missing row is a failure too: without it
    //    the invitations-by-email read below has nothing to match on.
    const { data: user, error: userError } = await getAdminClient()
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (userError) return exportFailed('users', userError);
    if (!user) return exportFailed('users', 'no users row for verified id');

    // 2. public.game_players — all rows where this user was a player
    const { data: gamePlayers, error: gamePlayersError } = await supabase
      .from('game_players')
      .select('*')
      .eq('user_id', userId);
    if (gamePlayersError) return exportFailed('game_players', gamePlayersError);

    // 3. public.scores — only the user's OWN scores (user_id matches) and any
    //    scores THEY entered for others (entered_by matches). Exporting scores
    //    for the entire game would leak teammates' and opponents' personal data,
    //    which is not what GDPR Article 20 entitles the requester to.
    const { data: scores, error: scoresError } = await selectAllRowsResult(
      (from, to) =>
        supabase
          .from('scores')
          .select('*')
          .or(`user_id.eq.${userId},entered_by.eq.${userId}`)
          .order('id')
          .range(from, to),
      'profile export scores',
    );
    if (scoresError) return exportFailed('scores', scoresError);

    // 4. public.invitations — rows where email matches OR invited_by matches.
    //    Case-insensitive like every other invitation lookup (#2207).
    const { data: invitationsByEmail, error: invitationsByEmailError } = await supabase
      .from('invitations')
      .select('*')
      .filter('email', 'imatch', emailMatchPattern(user.email));
    if (invitationsByEmailError) {
      return exportFailed('invitations by email', invitationsByEmailError);
    }

    const { data: invitationsByInviter, error: invitationsByInviterError } = await supabase
      .from('invitations')
      .select('*')
      .eq('invited_by', userId);
    if (invitationsByInviterError) {
      return exportFailed('invitations by inviter', invitationsByInviterError);
    }

    // Merge invitations, deduplicate by id
    const invitationMap = new Map<string, unknown>();
    for (const inv of [...(invitationsByEmail ?? []), ...(invitationsByInviter ?? [])]) {
      const row = inv as { id: string };
      invitationMap.set(row.id, inv);
    }
    const invitations = Array.from(invitationMap.values());

    // 5. public.friendships — every row the user is part of, any status.
    //    RLS (`friendships view own`) only returns the user's own rows.
    const { data: friendships, error: friendshipsError } = await selectAllRowsResult(
      (from, to) =>
        supabase
          .from('friendships')
          .select('*')
          .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
          .order('id')
          .range(from, to),
      'profile export friendships',
    );
    if (friendshipsError) return exportFailed('friendships', friendshipsError);

    // 6. public.group_members — the user's club memberships. The user_id
    //    filter IS the authz here: RLS lets a member see every member of
    //    their clubs, and an admin sees all of them.
    const { data: clubMemberships, error: clubMembershipsError } = await supabase
      .from('group_members')
      .select('group_id, role, joined_at, groups(name)')
      .eq('user_id', userId);
    if (clubMembershipsError) return exportFailed('club_memberships', clubMembershipsError);

    const exportDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `torny-data-${exportDate}.json`;

    const payload = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        user,
        game_players: gamePlayers ?? [],
        scores,
        invitations,
        friendships,
        club_memberships: clubMemberships ?? [],
      },
      null,
      2,
    );

    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return exportFailed('export', error);
  }
}
