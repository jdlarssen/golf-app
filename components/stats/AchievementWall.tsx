import { Card } from '@/components/ui/Card';
import type { Achievements } from '@/lib/stats/achievements';
import {
  ACHIEVEMENT_MARKS,
  WALL_BADGE_ORDER,
  type WallBadgeKey,
} from '@/lib/stats/achievementMarks';
import { AchievementBadge } from './AchievementBadge';

// Bragd-typene på veggen (`WallBadgeKey`). Snowman er bevisst UTELATT — en
// snømann (blow-up-hull) er negativt ladet, ikke en bragd, og surfaces ingen
// steder i UI-et (jf. `lib/stats/achievements.ts`).

type Props = {
  /** Livstids-bragder fra `computePlayerStats`. */
  achievements: Achievements;
  heading: string;
  subtitle: string;
  /** Label per bragd-type, allerede oversatt ved kallstedet. */
  labels: Record<WallBadgeKey, string>;
};

/**
 * «Bragd-veggen» (#947) — en aspirasjonell vegg med de fire bragd-typene i
 * Statistikk-fanen. Opptjente (count > 0) får champagne-gull-aksent (palettens
 * highlight-farge); ikke-opptjente dimmes som en «samling å fullføre», så
 * veggen står på egne ben også for en fersk spiller. Rent presentasjonelt —
 * livstids-tallene er regnet i `computePlayerStats` (Type A); labels sendes inn.
 */
export function AchievementWall({ achievements, heading, subtitle, labels }: Props) {
  return (
    <section className="space-y-3">
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="font-serif text-base font-medium text-text leading-snug">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>
        <ul className="grid grid-cols-2 gap-3 border-t border-border px-5 py-4 sm:grid-cols-4">
          {WALL_BADGE_ORDER.map((key) => {
            const count = achievements[key];
            const earned = count > 0;
            return (
              <li
                key={key}
                data-earned={earned ? 'true' : 'false'}
                className={`rounded-xl border px-2 py-3 text-center ${
                  earned
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-border bg-bg/50 opacity-50'
                }`}
              >
                <AchievementBadge mark={ACHIEVEMENT_MARKS[key]} earned={earned} />
                <span className="mt-1.5 block font-sans text-xs font-semibold text-muted leading-tight">
                  {labels[key]}
                </span>
                <span
                  className={`mt-1 block font-serif text-xl font-medium tabular-nums leading-none ${
                    earned ? 'text-accent-text' : 'text-muted'
                  }`}
                >
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
