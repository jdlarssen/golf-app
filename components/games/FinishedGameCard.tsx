import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { SmartLink } from '@/components/ui/SmartLink';
import { Card } from '@/components/ui/Card';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import type { FinishedGame } from '@/lib/games/getFinishedGamesForUser';

/**
 * Kort for et avsluttet spill, delt mellom Hjem («Avsluttede spill», siste 5)
 * og /spill-arkiv (alle, gruppert per måned) så de aldri visuelt driver fra
 * hverandre (#571). Layout per #570: navn / «bane · spillform» / sluttdato +
 * spillerens eget resultat (#572).
 *
 * Resultat-badgen viser ditt utfall: «🥇 Du vant» / «🥇 Laget vant» med gull-
 * accent for egen seier, «2. plass av 4» / «Du tapte 2&1» / «4 skins» dempet
 * ellers. Faller tilbake til 🏆 når `result_summary` mangler (spill avsluttet
 * før #572). Teksten kommer fra next-intl så den oversettes med #60.
 *
 * Ren server-trygg modul (ingen 'use client') — tappet leder til leaderboardet.
 * Dato og spillform-etikett rendres locale-bevisst (#60): `formatShortDateLocale`
 * + rute-locale, og spillform via `modes.*`-katalogen (ikke den norsk-only
 * `formatDisplayLabel`-konstanten).
 */
export function FinishedGameCard({ game }: { game: FinishedGame }) {
  const t = useTranslations('finishedCard');
  const tModes = useTranslations('modes');
  const locale = useLocale() as AppLocale;
  const badge = game.result_summary
    ? finishedResultBadge(game.result_summary)
    : null;

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
                tModes(
                  formatDisplayLabelKey(
                    game.game_mode,
                    game.mode_config,
                  ) as Parameters<typeof tModes>[0],
                ),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {game.ended_at && (
              <span className="block text-xs text-muted mt-1 tabular-nums truncate">
                {formatShortDateLocale(game.ended_at, locale)}
              </span>
            )}
          </div>
          {badge ? (
            <span
              className={`shrink-0 max-w-[45%] text-right text-sm font-medium leading-snug ${
                badge.isWin ? 'text-accent' : 'text-muted'
              }`}
            >
              {t(
                badge.key as Parameters<typeof t>[0],
                badge.values as Parameters<typeof t>[1],
              )}
            </span>
          ) : (
            <span aria-hidden className="text-accent shrink-0">
              🏆
            </span>
          )}
        </div>
      </Card>
    </SmartLink>
  );
}
