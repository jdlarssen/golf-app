import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

export async function GET() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 });
  }

  const supabase = await getServerClient();

  // 1. public.users — the user's own row
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  // 2. public.game_players — all rows where this user was a player
  const { data: gamePlayers } = await supabase
    .from('game_players')
    .select('*')
    .eq('user_id', userId);

  // 3. public.scores — only the user's OWN scores (user_id matches) and any
  //    scores THEY entered for others (entered_by matches). Exporting scores
  //    for the entire game would leak teammates' and opponents' personal data,
  //    which is not what GDPR Article 20 entitles the requester to.
  const { data: scoresData } = await supabase
    .from('scores')
    .select('*')
    .or(`user_id.eq.${userId},entered_by.eq.${userId}`);
  const scores = scoresData ?? [];

  // 4. public.invitations — rows where email matches OR invited_by matches
  const userEmail = user?.email ?? '';
  const { data: invitationsByEmail } = await supabase
    .from('invitations')
    .select('*')
    .eq('email', userEmail);

  const { data: invitationsByInviter } = await supabase
    .from('invitations')
    .select('*')
    .eq('invited_by', userId);

  // Merge invitations, deduplicate by id
  const invitationMap = new Map<string, unknown>();
  for (const inv of [...(invitationsByEmail ?? []), ...(invitationsByInviter ?? [])]) {
    const row = inv as { id: string };
    invitationMap.set(row.id, inv);
  }
  const invitations = Array.from(invitationMap.values());

  const exportDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `torny-data-${exportDate}.json`;

  const payload = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user,
      game_players: gamePlayers ?? [],
      scores,
      invitations,
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
}
