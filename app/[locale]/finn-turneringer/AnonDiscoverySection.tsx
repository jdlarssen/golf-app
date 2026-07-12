import { useLocale, useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffParts } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { DiscoverableOpenGame } from '@/lib/games/getDiscoverableGames';
import type { AppLocale } from '@/i18n/routing';

/**
 * Anonym variant av funn-lista (#1185). En uinnlogget besøkende ser åpne
 * turneringer som read-only-kort — hele kortet lenker til den offentlige
 * plakaten `/signup/[shortId]`, som selv håndterer login-runden. Ingen
 * påmeldings-actions her (de krever auth), og ingen sosialt bevis / roster —
 * kortet viser kun spill-metadata + banenavn (#1193: aldri navn anonymt).
 */
export function AnonDiscoverySection({
  games,
}: {
  games: DiscoverableOpenGame[];
}) {
  const t = useTranslations('discover');
  const locale = useLocale() as AppLocale;

  return (
    <ul
      className="flex list-none flex-col gap-3 p-0"
      data-testid="anon-discovery-list"
    >
      {games.map((game) => {
        const teeOff = game.scheduled_tee_off_at
          ? new Date(game.scheduled_tee_off_at)
          : null;
        const teeOffLine = teeOff
          ? (() => {
              const { date, time } = formatTeeOffParts(teeOff, locale);
              return t('teeOffLine', { date, time });
            })()
          : null;

        return (
          <li key={game.id}>
            <SmartLink
              href={`/signup/${game.short_id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              data-testid="anon-discovery-card"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-serif text-[17px] leading-tight text-text">
                  {localizeGameName(game.name, game.course_name, locale)}
                </span>
                <span className="mt-1 block font-sans text-[12px] text-muted">
                  {game.course_name ?? t('courseNotSet')}
                  {teeOffLine && (
                    <>
                      {' · '}
                      <span className="tabular-nums">{teeOffLine}</span>
                    </>
                  )}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
            </SmartLink>
          </li>
        );
      })}
    </ul>
  );
}
