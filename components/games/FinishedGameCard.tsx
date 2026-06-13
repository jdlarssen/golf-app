import { SmartLink } from '@/components/ui/SmartLink';
import { Card } from '@/components/ui/Card';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { formatDisplayLabel } from '@/lib/games/formatLabel';
import type { FinishedGame } from '@/lib/games/getFinishedGamesForUser';

/**
 * Kort for et avsluttet spill, delt mellom Hjem («Avsluttede spill», siste 5)
 * og /spill-arkiv (alle, gruppert per måned) så de aldri visuelt driver fra
 * hverandre (#571). Layout per #570: navn / «bane · spillform» / sluttdato / 🏆.
 *
 * Ren server-trygg modul (ingen 'use client') — tappet leder til leaderboardet.
 * `formatShortDateLocale(_, 'no')` matcher den ennå norsk-literale hjem-siden;
 * helperen er locale-bevisst for #60-migreringen.
 */
export function FinishedGameCard({ game }: { game: FinishedGame }) {
  return (
    <SmartLink href={`/games/${game.id}/leaderboard`} className="block">
      <Card className="min-h-[44px] hover:border-primary/30 transition-colors p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
              {game.name}
            </span>
            <span className="block text-xs text-muted mt-1 truncate">
              {[
                game.courses?.name,
                formatDisplayLabel(game.game_mode, game.mode_config),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {game.ended_at && (
              <span className="block text-xs text-muted mt-1 tabular-nums truncate">
                {formatShortDateLocale(game.ended_at, 'no')}
              </span>
            )}
          </div>
          <span aria-hidden className="text-accent shrink-0">
            🏆
          </span>
        </div>
      </Card>
    </SmartLink>
  );
}
