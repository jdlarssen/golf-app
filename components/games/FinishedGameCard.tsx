import { useTranslations, useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { GameRowCard, GameRowMetaLine } from '@/components/games/GameRowCard';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { localizeGameName } from '@/lib/games/autoGameName';
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
    <GameRowCard
      href={`/games/${game.id}/leaderboard`}
      title={localizeGameName(game.name, game.courses?.name ?? null, locale)}
      meta={
        <>
          <GameRowMetaLine>
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
          </GameRowMetaLine>
          {game.ended_at && (
            <GameRowMetaLine tabular>
              {formatShortDateLocale(game.ended_at, locale)}
            </GameRowMetaLine>
          )}
        </>
      }
      trailing={
        badge ? (
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
        )
      }
    />
  );
}
