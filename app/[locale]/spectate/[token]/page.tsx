import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { parseMode } from '@/lib/leaderboard';
import { getGameBySpectateToken } from '@/lib/games/spectate';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { getAdminClient } from '@/lib/supabase/admin';
import { renderLeaderboardContent } from '../../games/[id]/leaderboard/leaderboardContent';
import { SpectatePoller } from './SpectatePoller';
import { SponsorStrip } from '@/components/SponsorStrip';
import { safeParsePrizes } from '@/lib/games/prizes';

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ mode?: string | string[] }>;

// #1264: secret spectate-token URLs must never be indexed (the embed page
// already carries this pattern). noindex + nofollow keeps them out of Google.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: AppLocale = routing.locales.includes(rawLocale as AppLocale)
    ? (rawLocale as AppLocale)
    : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'spectate' });
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
  };
}

/**
 * Public read-only live-follow page (#938). No authentication required —
 * the `spectate_token` in the URL is the full authz mechanism.
 *
 * Token resolution: admin client (RLS-bypass), so this page can render
 * without any session cookie. RLS on `scores` / `games` is NOT opened for
 * anonymous users; data flows through the admin client only server-side.
 *
 * Back-href: spectate visitors cannot access `/games/[id]` (they'd be
 * bounced to /login). We pass the spectate page's own path so any back
 * chevron in the format views is a harmless self-link rather than a
 * misleading login redirect.
 *
 * Live-updating: `SpectatePoller` calls `router.refresh()` every 20 s while
 * the game is active; it stops polling once the game is finished.
 */
export default async function SpectatePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const mode = parseMode(sp.mode);
  const locale = await getLocale();

  // Resolve the game via the spectate token.
  const found = await getGameBySpectateToken(token);
  if (!found) notFound();

  // Fetch game + players from the tag-cached helper (same cache as the
  // authed leaderboard; spectate route is read-only so no invalidation
  // concern).
  const gwp = await getGameWithPlayers(found.id);
  if (!gwp) notFound();

  const { game } = gwp;

  // Draft/scheduled games have no meaningful leaderboard yet — 404 is more
  // honest than showing an empty state. The token still exists (creator set
  // it up before starting), but there is nothing for spectators to see.
  if (game.status === 'draft' || game.status === 'scheduled') {
    notFound();
  }

  const live = game.status === 'active';
  // Self-referencing back-href: spectators cannot visit /games/[id] without
  // an account, so we point back at the spectate page itself.
  const backHref = `/${locale}/spectate/${token}`;

  // Admin client for uncached scores + course_holes fetches inside
  // renderLeaderboardContent. ReactionsProvider is NOT mounted
  // (includeReactions: false) — anonymous users have no reactions access
  // and we do not expose an interactive surface here.
  const adminClient = getAdminClient();

  const t = await getTranslations('spectate');
  const statusLabel = live ? t('liveStatus') : t('resultStatus');

  const leaderboardNode = await renderLeaderboardContent({
    gameId: found.id,
    game,
    mode,
    backHref,
    returnQuery: '',
    supabase: adminClient,
    includeReactions: false,
    viewerUserId: '',
  });

  return (
    <>
      {/* Spectate banner — non-intrusive strip at the top of the page.
          Deliberately minimal: game name + status (live / resultat).
          The format views already render the game name in their own chrome;
          this badge just communicates the public/spectate context clearly. */}
      <div
        role="banner"
        aria-label={t('bannerAriaLabel')}
        className={[
          'sticky top-0 z-40 flex items-center justify-center gap-2',
          'px-4 py-2 text-xs font-medium tracking-wide',
          live
            ? 'bg-accent/90 text-bg backdrop-blur-sm'
            : 'bg-primary/90 text-white backdrop-blur-sm',
        ].join(' ')}
      >
        {live && (
          <span
            aria-hidden
            className="inline-block size-2 rounded-full bg-white animate-pulse"
          />
        )}
        <span>{statusLabel}</span>
      </div>

      {/* #1051: sponsorstripe — vises når ≥1 premie har sponsor. */}
      <SponsorStrip prizes={safeParsePrizes(game.prizes)} />

      {leaderboardNode}

      {/* Client poller: refreshes the page every 20 s while the game is active.
          Renders nothing in the DOM — pure side-effect island. */}
      <SpectatePoller live={live} />
    </>
  );
}
