/**
 * Tegnet bragd-merke: tallet som står i ringen på bragd-veggen, på web
 * (`components/stats/AchievementBadge.tsx`) og i appen
 * (`native/app/src/components/history/AchievementBadge.tsx`). Tallene er golfens
 * egne: hole-in-one er «1» slag, en eagle er −2 mot par, en birdie −1, og en
 * turkey er tre strekk på rad («3×»). Ett hjem, så de to flatene ikke driver fra
 * hverandre. Rent og uten importer, så appen kan bruke fila direkte.
 *
 * Albatross (tre under par) har ikke noe eget bragd-merke på veggen, men Topplista (#2259)
 * viser ett i «Sjeldne slag», og det er «−3».
 *
 * Minustegnet er U+2212 («−»), ikke bindestrek, og kryss-tegnet er U+00D7 («×»).
 */
export type WallBadgeKey = 'holeInOne' | 'eagle' | 'birdie' | 'turkey';

/** Rekkefølgen på veggen. */
export const WALL_BADGE_ORDER: readonly WallBadgeKey[] = ['holeInOne', 'eagle', 'birdie', 'turkey'];

/** Merkene som finnes: veggens fire, og albatross (bare i «Sjeldne slag»). */
export type AchievementMarkKey = WallBadgeKey | 'albatross';

export const ACHIEVEMENT_MARKS: Record<AchievementMarkKey, string> = {
  holeInOne: '1',
  albatross: '−3',
  eagle: '−2',
  birdie: '−1',
  turkey: '3×',
};

/**
 * De sjeldne slagene, best først: det er rekkefølgen i «Sjeldne slag» og i
 * venne-varselet (`lib/notifications/cardContent.ts`), som tittelen navngir det første
 * av. Ett hjem, så de to ikke driver fra hverandre.
 */
export type RareMomentKind = 'hole_in_one' | 'albatross' | 'eagle';
export const RARE_MOMENT_ORDER: readonly RareMomentKind[] = ['hole_in_one', 'albatross', 'eagle'];

/** Merket i ringen for hvert sjeldent slag. */
export const RARE_MOMENT_MARK_KEY: Record<RareMomentKind, AchievementMarkKey> = {
  hole_in_one: 'holeInOne',
  albatross: 'albatross',
  eagle: 'eagle',
};
