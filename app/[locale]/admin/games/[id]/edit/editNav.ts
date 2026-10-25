import 'server-only';
import { getTranslations } from 'next-intl/server';
import { readCreatorStartBlock } from '@/lib/games/readCreatorStartBlock';
import { startBlockMessage } from '@/lib/games/startErrorMessage';
import { activePlayers, unassignedActivePlayers, type FlightPlayer } from '@/lib/games/flightScope';
import type { StructuralBlockReason } from '@/lib/games/startBlockReasons';
import type { EditGamePlayerRow } from '@/lib/games/editGameInitialValues';
import type { EditNav } from '@/app/[locale]/admin/games/new/EditOverview';

/**
 * #2322: the overview's links, its start block and its server-side texts, for
 * both edit routes. The block is `readCreatorStartBlock` (service role, so an
 * organiser who does not play still gets the whole roster, #366), and its
 * sentence is the one a refused «Start runden nå» gives (`startBlockMessage`).
 * The e-post list for `pending_players` is only built behind `requireAdmin`,
 * so it stays empty here, as in `CreatorStartBlockNotice`.
 */
export async function buildEditNav({
  gameId,
  playerRows,
  ...links
}: {
  gameId: string;
  playerRows: readonly EditGamePlayerRow[];
  title: string;
  baseHref: string;
  deleteHref: string;
  startlistHref: string;
  startAction: () => void | Promise<void>;
}): Promise<EditNav> {
  const [block, tErrors, tStatus, tButtons] = await Promise.all([
    readCreatorStartBlock(gameId),
    getTranslations('admin.game.errors'),
    getTranslations('gameStatus'),
    getTranslations('admin.game.buttons'),
  ]);
  const { startAction, ...hrefs } = links;
  const roster: FlightPlayer[] = playerRows.map((r) => ({
    user_id: r.user_id,
    flight_number: r.flight_number,
    withdrawn_at: r.withdrawn_at ?? null,
  }));
  return {
    ...hrefs,
    flightCount: new Set(
      activePlayers(roster).flatMap((p) => (p.flight_number == null ? [] : [p.flight_number])),
    ).size,
    statusLabel: tStatus('scheduled'),
    startBlock: block && {
      // readCreatorStartBlock returns structural reasons only.
      reason: block.reason as StructuralBlockReason,
      message:
        block.reason === 'unassigned_flights'
          ? null
          : (startBlockMessage(block, '', tErrors) ?? null),
      unassignedCount: unassignedActivePlayers(roster).length,
    },
    start: {
      action: startAction,
      label: tButtons('startRoundNow'),
      confirmText: tButtons('startRoundConfirm'),
    },
  };
}
