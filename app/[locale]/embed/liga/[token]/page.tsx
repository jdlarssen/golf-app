import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getLeagueBySpectateToken } from '@/lib/league/spectate';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { isPointsBasedFormat } from '@/lib/league/flightFormat';
import type { LeagueFormat } from '@/lib/league/types';
import { LeagueStandingsPanel } from '@/components/league/LeagueStandingsPanel';
import { Card } from '@/components/ui/Card';
import { first } from '@/lib/url/searchParams';
import { SpectatePoller } from '@/app/[locale]/spectate/[token]/SpectatePoller';
import { EmbedFooter } from '../../EmbedFooter';
import { EmbedThemeScript, parseEmbedTheme } from '../../EmbedThemeScript';

type Params = Promise<{ token: string }>;
type SearchParams = Promise<{ theme?: string | string[] }>;

// Embeds are widgets, not pages — the public course pages (#1023) own SEO.
export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Iframe-friendly league standings table (#1024) — the club-website surface
 * of the «Vindu ut» epic. Token-gated with the exact access model from
 * spectate (#938): `leagues.spectate_token` is set when the league admin
 * enables the embed and nulled when they turn it off (old iframes 404).
 *
 * Shows the same season table as the in-app `/liga/[id]` page — the shared
 * `LeagueStandingsPanel` (with its Netto/Brutto toggle) — and nothing else:
 * no rounds management, no participants list, no join actions.
 */
export default async function EmbedLigaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const theme = parseEmbedTheme(first(sp.theme));

  const found = await getLeagueBySpectateToken(token);
  if (!found) notFound();

  const snapshot = await getLigaSnapshot(found.id);
  if (!snapshot) notFound();

  const { league, rounds, participants, standings } = snapshot;
  const live = league.status === 'active';

  const t = await getTranslations('embed');

  return (
    <div className="px-3 pt-4">
      <EmbedThemeScript theme={theme} />
      <h1 className="mb-3 px-1 font-serif text-xl font-medium leading-snug tracking-[-0.015em] text-text">
        {league.name}
      </h1>
      <Card className="p-3 sm:p-4">
        <LeagueStandingsPanel
          standings={standings}
          rounds={rounds}
          participants={participants}
          standingsModel={league.standings_model}
          bestNCount={league.best_n_count}
          pointsBased={isPointsBasedFormat(league.format as LeagueFormat)}
        />
      </Card>
      <EmbedFooter
        href="https://tornygolf.no"
        live={live}
        statusLabel={live ? t('seasonRunning') : t('seasonDone')}
      />
      {/* 60 s poll — a season table changes per delivered round, not per stroke. */}
      <SpectatePoller live={live} intervalMs={60_000} />
    </div>
  );
}
