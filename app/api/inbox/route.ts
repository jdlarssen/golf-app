import { NextResponse, after, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { buildInboxWire } from '@/lib/notifications/inboxWire';
import { getFinishedCardTranslator, getInboxTranslator } from '@/lib/notifications/inboxTranslator';
import { loadInboxBoard, settleInboxBoard } from '@/lib/notifications/loadInboxBoard';
import { SHOW_KRONER_IN_APP } from '@/lib/launchRules';

// Innboksen i appen (#2759): det samme webbens `/innboks` viser.
//
// **Hvorfor en rute.** Tavla trenger oppslag med admin-klienten (spillene bak
// varslene, påmeldingene), og tekstene ligger i `messages/no.json`, som appen
// ikke kan bundle. Telefonen kan aldri holde den nøkkelen, så appen spør her og
// får radene ferdig skrevet. Reglene bor i `lib/notifications/inboxSections.ts`.
//
// **Språk:** `no`. Appen finnes bare på norsk.
//
// **Kroner:** teksten følger samme bryter som pushen til appen (`sendPush.ts`).
//
// AUTH: `authenticatedUserId` — id-en fra det validerte tokenet, aldri fra
// query eller kropp. Varslene leses som kalleren, under RLS.
//
// WIRE (appen speiler den, `native/app/src/data/inbox.ts`; feltene legges bare
// til): GET 200 InboxWire (`lib/notifications/inboxWire.ts`)
//     401 { error: 'unauthorized' }
//     500 { error: 'load_failed' }

const LOCALE = 'no';

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const client = callerScopedClient(request);
    if (!client) throw new Error('caller-scoped client unavailable');

    const board = await loadInboxBoard(client, userId);
    if (board.staleIds.length > 0 || board.settledIds.length > 0) {
      after(() => settleInboxBoard(userId, board));
    }

    const [t, tFinished] = await Promise.all([
      getInboxTranslator(LOCALE),
      getFinishedCardTranslator(LOCALE),
    ]);
    return NextResponse.json(
      buildInboxWire(board, {
        t,
        tFinished,
        locale: LOCALE,
        surface: SHOW_KRONER_IN_APP ? 'web' : 'app',
      }),
    );
  } catch (err) {
    console.error('[api/inbox] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
