import { NextResponse, after, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { archiveStaleNotifications } from '@/lib/notifications/archive';
import { getInboxBoardTranslators } from '@/lib/notifications/inboxTranslator';
import { buildInboxWire } from '@/lib/notifications/inboxWire';
import { loadInboxBoard } from '@/lib/notifications/loadInboxBoard';
import { markSettledRead } from '@/lib/notifications/markRead';

// Innboksen i appen (#2759): det samme webbens `/innboks` viser.
//
// **Hvorfor en rute.** Tavla slår opp spill, kort og påmeldinger med
// admin-klienten, og en telefon kan aldri holde den nøkkelen. Radtekstene
// kommer fra `messages/no.json`, som ikke kan bundles i appen. Reglene og
// lesingen er de samme som på webben (`loadInboxBoard`, `inboxSections`).
//
// **Skriver også.** Som webbens side: saker som er gjort, merkes lest i `after()`,
// og tallet i svaret regner dem alt som lest. Slik faller tallet på Hjem uten at
// innboksen åpnes.
//
// AUTH: `authenticatedUserId` og kallerens egen klient (RLS). Radene leses med
// den, og oppslagene med id-er fra de radene. Språk: `no`, appen finnes bare på
// norsk.
//
// WIRE (`InboxWire` i `lib/notifications/inboxWire.ts`; feltene legges bare til):
//   GET 200 { actionCount, hasUnread, unreadCount,
//             sections: { action: Entry[], today: Entry[], earlier: Entry[] } }
//       Entry = InboxEntryView & { key, unread, unreadIds, friend, decidable }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    const client = callerScopedClient(request);
    if (!userId || !client) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const board = await loadInboxBoard(client, userId);
    after(async () => {
      await Promise.all([
        archiveStaleNotifications({ userId, ids: board.staleIds }),
        markSettledRead({ userId, ids: board.settledIds }),
      ]);
    });

    const translators = await getInboxBoardTranslators('no');
    return NextResponse.json(buildInboxWire(board, { ...translators, locale: 'no' }));
  } catch (err) {
    console.error('[api/inbox] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
