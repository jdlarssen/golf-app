/**
 * «Klubb-turnering» as the app reads it (#2753): the wire shape of
 * `GET /api/games/club-options`, and the pure function that builds it.
 *
 * Pure and free of `server-only`: the native app imports the types by relative
 * path, and the builder is tested without a database. The loader that feeds it
 * is `appClubOptions.ts`.
 *
 * The tile rule is the web's own (`canCreateClubGame` in `lib/wizard/
 * clubChoice.ts`), so the app offers «Klubb-turnering» to exactly the people
 * the web does. Without the tile nobody needs the member lists, so they are
 * left out of the answer then.
 */
import { canCreateClubGame } from '@/lib/wizard/clubChoice';

export type AppClubRole = 'owner' | 'admin' | 'member';

/** One valid club you are a member of, as the club picker shows it. */
export type AppClubOption = {
  id: string;
  name: string;
  /** Your role in the club. The card names it only for owner and admin. */
  role: AppClubRole;
  memberCount: number;
};

/** A club member in the app's roster shape (`RosterCandidate`). No e-mail (#435). */
export type AppClubMember = {
  id: string;
  name: string;
  nickname: string | null;
  hcpIndex: number;
  gender: 'mens' | 'ladies' | null;
  level: 'junior' | 'normal' | 'senior';
  /** The profile is not completed. Stops the start, not the publish (#2441). */
  pending: boolean;
};

export type AppClubOptions = {
  canCreateClubGame: boolean;
  clubs: AppClubOption[];
  /** clubId → the members, you included, sorted by name. */
  membersByClub: Record<string, AppClubMember[]>;
};

/** What the loader read, before the rule is applied. */
export type AppClubOptionsInput = {
  isAdmin: boolean;
  isClubAdmin: boolean;
  /** Valid clubs you are a member of (not expired), with your role. */
  clubs: { id: string; name: string; role: AppClubRole }[];
  memberIdsByClub: Record<string, string[]>;
  members: AppClubMember[];
};

const NO_CLUB: AppClubOptions = { canCreateClubGame: false, clubs: [], membersByClub: {} };

export function buildAppClubOptions(input: AppClubOptionsInput): AppClubOptions {
  const allowed = canCreateClubGame({
    isAdmin: input.isAdmin,
    isClubAdmin: input.isClubAdmin,
    hasClub: input.clubs.length > 0,
  });
  if (!allowed) return NO_CLUB;

  const byId = new Map(input.members.map((m) => [m.id, m]));
  const membersByClub: Record<string, AppClubMember[]> = {};
  for (const club of input.clubs) {
    membersByClub[club.id] = (input.memberIdsByClub[club.id] ?? [])
      .map((id) => byId.get(id))
      .filter((m): m is AppClubMember => m !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  }

  return {
    canCreateClubGame: true,
    clubs: input.clubs
      .map((club) => ({
        ...club,
        memberCount: (input.memberIdsByClub[club.id] ?? []).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
    membersByClub,
  };
}
