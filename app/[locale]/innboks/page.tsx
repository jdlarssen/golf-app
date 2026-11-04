import { after } from 'next/server';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { loadInboxBoard, settleInboxBoard } from '@/lib/notifications/loadInboxBoard';
import { InboxClient } from './InboxClient';

/**
 * /innboks as a board (#2263): KREVER HANDLING, I DAG, TIDLIGERE. The read is
 * `loadInboxBoard`, shared with the app's route (#2759). A query that fails
 * throws to the error boundary («Prøv igjen»). What the read found goes in
 * `after()`, since Next.js 16 allows no DB writes during render.
 */
export default async function InboxPage() {
  const locale = await getLocale();

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const board = await loadInboxBoard(await getServerClient(), userId);
  if (board.staleIds.length > 0 || board.settledIds.length > 0) {
    after(() => settleInboxBoard(userId, board));
  }

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
