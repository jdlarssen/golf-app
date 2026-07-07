import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { parseMode } from '@/lib/leaderboard';
import { getGameBySpectateToken } from '@/lib/games/spectate';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { first } from '@/lib/url/searchParams';
import { renderLeaderboardContent } from '@/app/[locale]/games/[id]/leaderboard/leaderboardContent';
import { SpectatePoller } from '@/app/[locale]/spectate/[token]/SpectatePoller';
import { EmbedFooter } from '../../EmbedFooter';
import { SponsorStrip } from '@/components/SponsorStrip';
import { safeParsePrizes } from '@/lib/games/prizes';
import { EmbedThemeScript, parseEmbedTheme } from '../../EmbedThemeScript';

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ mode?: string | string[]; theme?: string | string[] }>;

// Embeds are widgets, not pages — the public course pages (#1023) own SEO.
export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Iframe-friendly game leaderboard (#1024). Rides the exact spectate access
 * model (#938): same `games.spectate_token`, same admin-client read path,
 * same reveal-aware leaderboard render — so the embed can never expose more
 * than the live link does, and revoking the token kills both.
 *
 * Differences from /spectate/[token]: no sticky banner (chrome-free for
 * iframes), an always-on attribution footer, a forced light theme
 * (`?theme=dark` opt-in), and frame-ancestors headers that allow framing
 * (set in next.config.ts — the rest of the app refuses framing).
 */
export default async function EmbedGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const mode = parseMode(sp.mode);
  const theme = parseEmbedTheme(first(sp.theme));
  const locale = await getLocale();

  const found = await getGameBySpectateToken(token);
  if (!found) notFound();

  const gwp = await getGameWithPlayers(found.id);
  if (!gwp) notFound();

  const { game } = gwp;

  // Draft/scheduled games have no meaningful leaderboard yet (same rule as
  // the spectate page).
  if (game.status === 'draft' || game.status === 'scheduled') {
    notFound();
  }

  const live = game.status === 'active';
  // Self-referencing back-href: embed visitors have no session, so any back
  // chevron in the format views must not point into the authed app.
  const backHref = `/${locale}/embed/spill/${token}`;

  const t = await getTranslations('embed');

  const leaderboardNode = await renderLeaderboardContent({
    gameId: found.id,
    game,
    mode,
    backHref,
    returnQuery: '',
    supabase: getAdminClient(),
    includeReactions: false,
    viewerUserId: '',
  });

  return (
    <>
      <EmbedThemeScript theme={theme} />
      {leaderboardNode}
      {/* #1051: sponsorstripe over embed-footeren (self-hider uten sponsor). */}
      <SponsorStrip prizes={safeParsePrizes(game.prizes)} />
      <EmbedFooter
        href={`/${locale}/spectate/${token}`}
        live={live}
        statusLabel={live ? t('liveStatus') : t('resultStatus')}
      />
      <SpectatePoller live={live} />
    </>
  );
}
