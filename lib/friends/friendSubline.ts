import type { FriendStats } from './friendStats';

/** The words the caller's catalog gives (`friends.*`). */
export type FriendSublineText = {
  noRounds: string;
  hcp: (hcp: number) => string;
  rounds: (count: number) => string;
  lastPlayed: (iso: string) => string;
};

/**
 * The line under a friend on the web's friends page (#2267): «HCP 9,4 · 8
 * runder sammen · sist lørdag», and «Ingen runder sammen ennå» without a
 * finished round together. Parts the server does not have stay out; unread
 * numbers give no line at all. The app has its own in `friendsCopy.ts`.
 */
export function friendSubline(
  friend: { hcp: number | null; stats: FriendStats | null },
  text: FriendSublineText,
): string | null {
  const { hcp, stats } = friend;
  if (stats === null) return null;
  if (stats.roundsTogether === 0) return text.noRounds;
  const parts: string[] = [];
  if (hcp !== null) parts.push(text.hcp(hcp));
  parts.push(text.rounds(stats.roundsTogether));
  if (stats.lastPlayedAt) parts.push(text.lastPlayed(stats.lastPlayedAt));
  return parts.join(' · ');
}
