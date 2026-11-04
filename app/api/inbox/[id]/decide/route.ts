import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { decideFromInbox } from '@/lib/notifications/decideFromInbox';
import { inboxPerson } from '@/lib/notifications/inboxSections';
import type { NotificationPayload } from '@/lib/notifications/types';
import { isUuid } from '@/lib/url/isUuid';

// «Godta» og «Avslå» på en påmelding i appens innboks (#2759).
//
// `id` er varselets id. `request_id` leses fra varselraden med kallerens egen
// klient, aldri fra kroppen: RLS viser bare egne varsler, så en annens id gir
// 404, og et `request_id` i kroppen gjør ingenting. Hvem som får svare, avgjør
// kjernen bak webbens innboks (`registrationDecisionCore`, #2440).
//
// AUTH: `authenticatedUserId` — id-en fra det validerte tokenet.
//
// WIRE (appen speiler den, `native/app/src/data/inbox.ts`):
//   POST { decision: 'approve' | 'reject' }
//     200 { outcome: 'approved' | 'rejected', gameName, teamName, name }
//         (`name` er fornavnet til den som ba om å bli med, eller `null`)
//     400 { error: 'bad_request' }   ukjent `decision`, eller et varsel uten
//                                    påmelding å svare på
//     401 { error: 'unauthorized' }
//     403 { reason: 'forbidden' }
//     404 { error: 'not_found' }     ikke ditt varsel, eller ingen slik id
//     409 { reason: <DecisionFailure> }
//     500 { reason: 'error' }

type RouteContext = { params: Promise<{ id: string }> };

async function readDecision(request: NextRequest): Promise<'approve' | 'reject' | null> {
  try {
    const body: unknown = await request.json();
    const decision = (body as { decision?: unknown } | null)?.decision;
    return decision === 'approve' || decision === 'reject' ? decision : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const decision = await readDecision(request);
    if (!decision) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

    const client = callerScopedClient(request);
    if (!client) throw new Error('caller-scoped client unavailable');

    const { data: row, error } = await client
      .from('notifications')
      .select('kind, payload')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const payload = row.payload as NotificationPayload<'registration_request'> | null;
    const requestId = row.kind === 'registration_request' ? payload?.request_id : null;
    if (typeof requestId !== 'string' || !isUuid(requestId)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const result = await decideFromInbox({ client, userId, notificationId: id, requestId, decision });
    if (result.ok) {
      return NextResponse.json({
        outcome: result.outcome,
        gameName: result.gameName,
        teamName: result.teamName,
        name: inboxPerson(payload?.requester_name)?.short ?? null,
      });
    }
    const status = result.reason === 'forbidden' ? 403 : result.reason === 'error' ? 500 : 409;
    return NextResponse.json({ reason: result.reason }, { status });
  } catch (err) {
    console.error('[api/inbox/decide] failed', err);
    return NextResponse.json({ reason: 'error' }, { status: 500 });
  }
}
