import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';

export type WithdrawnPlayer = {
  user_id: string;
  display_name: string;
};

type Props = {
  players: WithdrawnPlayer[];
};

/**
 * Shared «Trukket»-section rendered under the main leaderboard for any
 * in-scope game mode (best_ball, stableford, modified_stableford,
 * solo_strokeplay — #386). Shows withdrawn players with a muted badge and
 * no position. Renders nothing when the list is empty.
 *
 * The page sets the side gutter: the card spans the content width, and the
 * kicker sits 4 px in, like the board's own labels. `p-0!` because `Card`'s
 * own `p-6` otherwise wins over a plain `p-0` (#2286).
 */
export function WithdrawnPlayersSection({ players }: Props) {
  const t = useTranslations('leaderboard.withdrawn');

  if (players.length === 0) return null;

  return (
    <div className="mt-4">
      <Kicker className="mb-2 px-1">{t('sectionTitle')}</Kicker>
      <Card className="p-0! overflow-hidden">
        <ul className="divide-y divide-border">
          {players.map((p) => (
            <li
              key={p.user_id}
              className="flex items-center justify-between gap-4 px-5 py-3"
            >
              <span className="font-sans text-sm text-text truncate">
                {p.display_name}
              </span>
              <span className="shrink-0 rounded-full bg-muted/10 px-2.5 py-0.5 text-xs font-medium text-muted">
                {t('badge')}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
