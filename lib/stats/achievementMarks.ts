/**
 * Tegnet bragd-merke: tallet som står i ringen på bragd-veggen, på web
 * (`components/stats/AchievementBadge.tsx`) og i appen
 * (`native/app/src/components/history/AchievementBadge.tsx`). Tallene er golfens
 * egne: hole-in-one er «1» slag, en eagle er −2 mot par, en birdie −1, og en
 * turkey er tre strekk på rad («3×»). Ett hjem, så de to flatene ikke driver fra
 * hverandre. Rent og uten importer, så appen kan bruke fila direkte.
 *
 * Minustegnet er U+2212 («−»), ikke bindestrek, og kryss-tegnet er U+00D7 («×»).
 */
export type WallBadgeKey = 'holeInOne' | 'eagle' | 'birdie' | 'turkey';

/** Rekkefølgen på veggen. */
export const WALL_BADGE_ORDER: readonly WallBadgeKey[] = ['holeInOne', 'eagle', 'birdie', 'turkey'];

export const ACHIEVEMENT_MARKS: Record<WallBadgeKey, string> = {
  holeInOne: '1',
  eagle: '−2',
  birdie: '−1',
  turkey: '3×',
};
