import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import type { AppCupListResponse, AppCupSummary } from '@/lib/cup/appCupView';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { getMyCupIds } from '@/lib/cup/myCups';
import { getRoomCups } from '@/lib/cup/getRoomCups';

// «Cupene dine» på Hjem i appen (#2752): de samme cupene Klubbhus-rommet viser,
// med fremdriften fra cup-siden. Bare cuper som ikke er avsluttet: en ferdig cup
// nås fra runden du spilte, og fra varselet om at den er avsluttet.
//
// AUTH: `authenticatedUserId`, id-en kommer bare fra det validerte tokenet.
// Cup-id-ene leses som kalleren (`callerScopedClient`), som nettsiden. Raden sier
// ingenting om stillingen, bare fremdriften (#1468).
//
// WIRE (appen speiler den, `lib/cup/appCupView.ts`):
//   GET 200 AppCupListResponse · 401 unauthorized · 500 load_failed

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');

    const room = await getRoomCups(await getMyCupIds(caller, userId), APP_CUP_UNKNOWN_PLAYER);
    if (!room.ok) throw new Error('room cups failed');

    const body: AppCupListResponse = {
      cups: room.live.map(
        (cup): AppCupSummary => ({
          id: cup.id,
          name: cup.name,
          status: cup.status as AppCupSummary['status'],
          progress: cup.progress,
        }),
      ),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
