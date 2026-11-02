import { NextResponse, type NextRequest } from 'next/server';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { buildAppCupParticipantsView } from '@/lib/cup/buildAppCupSetupView';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { getCupCandidatePlayers } from '@/lib/cup/getCupCandidatePlayers';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';
import { addCupParticipantCore, revalidateCupSetup } from '@/lib/cup/setupCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Spillerlista i en cup fra appen (#2752), samme kilde og kjerne som nettets
// Spillere-rom. `tournament_participants` har ingen skrive-policy (0155), så porten
// ER håndhevelsen (AGENTS.md felle 3).
//
// WIRE (`lib/cup/appCupSetupView.ts`):
//   GET 200 AppCupParticipantsView · 401 · 403 not_manager · 404 · 500 load_failed
//   POST { userId } 200 { ok: true } · 400 invalid_request · 401 · 403 · 404
//        409 not_draft | not_candidate | too_many_players · 500 plan_save_failed

type RouteContext = { params: Promise<{ id: string }> };

type UserRel = { name: string | null; nickname: string | null; hcp_index: number | string | null } | null;

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const admin = getAdminClient();
    const [cupRes, participantRes] = await Promise.all([
      admin
        .from('tournaments')
        .select('id, name, status, team_1_name, team_2_name, short_id')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('tournament_participants')
        .select('user_id, is_captain, users:users!tournament_participants_user_id_fkey(name, nickname, hcp_index)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
    ]);
    if (cupRes.error) throw cupRes.error;
    if (participantRes.error) throw participantRes.error;
    if (!cupRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // En startet cup har en låst liste, så det er ingen å legge til.
    const candidates =
      cupRes.data.status === 'draft'
        ? await getCupCandidatePlayers(gate.caller, {
            groupId: gate.groupId,
            userId: gate.userId,
            isAdmin: gate.isAdmin,
            unknownLabel: APP_CUP_UNKNOWN_PLAYER,
          })
        : [];

    return NextResponse.json(
      buildAppCupParticipantsView({
        cup: cupRes.data,
        // #526: personlig cup hos en vanlig bruker har tak, admin og klubb har ikke.
        cap: !gate.groupId && !gate.isAdmin ? MAX_PERSONAL_CUP_PLAYERS : null,
        participants: (participantRes.data ?? []).map((row) => {
          const user = row.users as UserRel;
          return {
            userId: row.user_id,
            name: user?.nickname?.trim() || user?.name?.trim() || APP_CUP_UNKNOWN_PLAYER,
            hcpIndex: Number(user?.hcp_index ?? 0),
            isCaptain: row.is_captain === true,
          };
        }),
        candidates: candidates.map((candidate) => ({
          userId: candidate.id,
          name: candidate.displayName,
          hcpIndex: candidate.hcpIndex,
          pending: candidate.pending ?? false,
        })),
      }),
    );
  } catch (err) {
    console.error('[api/cup/[id]/participants] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const { userId } = await jsonObject(request);
    if (typeof userId !== 'string' || !isUuid(userId)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await addCupParticipantCore(getAdminClient(), gate.caller, {
      tournamentId: id,
      targetUserId: userId,
      actor: { userId: gate.userId, isAdmin: gate.isAdmin },
      groupId: gate.groupId,
    });
    if (!result.ok) return cupActionFailure(result.error, 'plan_save_failed');

    revalidateCupSetup(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/participants] add threw', err);
    return NextResponse.json({ error: 'plan_save_failed' }, { status: 500 });
  }
}
