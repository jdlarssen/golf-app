import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { decideFromInbox } from '@/lib/notifications/decideFromInbox';
import { inboxPerson } from '@/lib/notifications/inboxSections';
import type { NotificationPayload } from '@/lib/notifications/types';
import { isUuid } from '@/lib/url/isUuid';

// «Godta» og «Avslå» i appens innboks (#2759): samme kjerne som webbens innboks
// og påmeldingssiden, så samme regel avgjør hvem som kan svare (#2440).
//
// **`id` er varselets id, og request_id leses fra varselet.** Med kallerens egen
// klient, så en fremmed id gir 404 uten å si noe om raden. Kroppen bærer bare
// svaret; en `request_id` der blir aldri lest (`webApi.ts`).
//
// WIRE:
//   POST { decision: 'approve' | 'reject' }
//     200 { outcome: 'approved' | 'rejected', gameName, teamName: string | null, name: string | null }
//         (`name` er fornavnet til den som ba om å bli med, til statuslinja)
//     400 { error: 'invalid_decision' | 'not_decidable' }
//     401 { error: 'unauthorized' }
//     403 { error: 'forbidden' }
//     404 { error: 'not_found' }
//     409 { error: 'not_pending' | 'request_not_found' | 'game_not_found'
//                  | 'game_locked' | 'no_team_slot' }
//     500 { error: 'failed' }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await authenticatedUserId(request);
    const client = callerScopedClient(request);
    if (!userId || !client) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const decision = await readDecision(request);
    if (!decision) return NextResponse.json({ error: 'invalid_decision' }, { status: 400 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { data: row, error } = await client
      .from('notifications')
      .select('kind, payload')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<{ kind: string; payload: NotificationPayload<'registration_request'> }>();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (row.kind !== 'registration_request' || !row.payload.request_id) {
      return NextResponse.json({ error: 'not_decidable' }, { status: 400 });
    }

    const result = await decideFromInbox({
      client,
      userId,
      notificationId: id,
      requestId: row.payload.request_id,
      decision,
    });
    if (result.ok) {
      return NextResponse.json({
        outcome: result.outcome,
        gameName: result.gameName,
        teamName: result.teamName,
        name: inboxPerson(row.payload.requester_name)?.short ?? null,
      });
    }
    if (result.reason === 'error') return NextResponse.json({ error: 'failed' }, { status: 500 });
    return NextResponse.json({ error: result.reason }, { status: result.reason === 'forbidden' ? 403 : 409 });
  } catch (err) {
    console.error('[api/inbox/decide] failed', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

async function readDecision(request: NextRequest): Promise<'approve' | 'reject' | null> {
  try {
    const body = (await request.json()) as { decision?: unknown };
    return body.decision === 'approve' || body.decision === 'reject' ? body.decision : null;
  } catch {
    return null;
  }
}
