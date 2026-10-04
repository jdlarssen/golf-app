import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import type { StartBlock } from '@/lib/games/startBlockReason';
import { startBlockMessage } from '@/lib/games/startErrorMessage';

/**
 * The organiser's warning on the game page while the round cannot start
 * (#2204): the Sekretariat's lead and the same `admin.game.errors` sentence a
 * refused «Start runden nå» gives. Before and after tee-off, also in the view
 * for an organiser who does not play (#2202).
 *
 * A server component on purpose: `admin` is a scoped client namespace, and the
 * game page has no `IntlScope` for it (#2227), so the text is resolved here.
 * The player list is always empty: the e-post list is built only behind
 * `requireAdmin`, and «Styr spillere» names who is missing (#2441).
 */
export async function CreatorStartBlockNotice({ block }: { block: StartBlock }) {
  const tCta = await getTranslations('admin.game.cta');
  const tErrors = await getTranslations('admin.game.errors');
  const message = startBlockMessage(block, '', tErrors);
  if (!message) return null;
  return (
    <Banner tone="warning" testId="creator-start-block-notice">
      {tCta('scheduledStartBlockedLead')} {message}
    </Banner>
  );
}
