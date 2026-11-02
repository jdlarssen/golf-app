/** What the app's confirmation shows before a cup is deleted (#2752). */
export type AppCupDeletePreview = {
  name: string;
  team1Name: string;
  team2Name: string;
  /** The app deletes only a cup that has not started. */
  draft: boolean;
  /** The matches that go with it: the hosts and the singles that ride along. */
  matchCount: number;
  /** Played matches, which stay as standalone games. */
  keptCount: number;
};
