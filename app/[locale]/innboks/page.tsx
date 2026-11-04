import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { archiveStaleNotifications } from '@/lib/notifications/archive';
import { loadInboxBoard } from '@/lib/notifications/loadInboxBoard';
import { markSettledRead } from '@/lib/notifications/markRead';
import { InboxClient } from './InboxClient';

/**
 * /innboks as a board (#2263): KREVER HANDLING, I DAG, TIDLIGERE. The reads and
 * the rules are `loadInboxBoard`, which the app's route shares (#2759). A failed
 * read throws to the error boundary («Prøv igjen»).
 *
 * The page does the writes, in `after()` (no DB writes during render in Next.js
 * 16), best-effort: rows about a game that is gone are archived, so they stop
 * lighting the bottom-nav dot (#1393), and rows whose matter is done are marked
 * read. They already show as read here.
 */
export default async function InboxPage() {
  const locale = await getLocale();

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const board = await loadInboxBoard(await getServerClient(), userId);
  after(async () => {
    await Promise.all([
      archiveStaleNotifications({ userId, ids: board.staleIds }),
      markSettledRead({ userId, ids: board.settledIds }),
    ]);
  });

  const tSignups = await getTranslations('admin.game.signups');

  return (
    <AppShell flush showVersion={false}>
      <InboxClient
        initialNotifications={board.rows}
        teeOffByGame={board.teeOffByGame}
        resultByGame={board.resultByGame}
        finishedGameIds={board.finishedGameIds}
        leagueFlightGameIds={board.leagueFlightGameIds}
        now={board.now}
        signupErrorText={{
          game_locked: tSignups('errors.game_locked'),
          no_team_slot: tSignups('errors.no_team_slot'),
        }}
      />
    </AppShell>
  );
}
