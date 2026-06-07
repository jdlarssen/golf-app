// Pure predicate for the member self-service buttons on /liga/[id] (#452 Fase 3).
// The SQL RPCs (join_club_league / leave_club_league, migration 0086) are the
// authority at click time; this decides which buttons to *show*.

import type { LeagueStatus } from './types';

export type LeagueSelfServiceInput = {
  /** null = frittstående liga; self-service is club-only. */
  groupId: string | null;
  status: LeagueStatus;
  /** Is the viewer a member of the league's club? */
  isClubMember: boolean;
  /** Is the viewer already in league_players? */
  isParticipant: boolean;
  /** Has the viewer delivered a scorecard in any of the league's flights? */
  hasPlayed: boolean;
};

export type LeagueSelfServiceState = {
  /** Show «Bli med i ligaen» — a club member can self-join a draft club league. */
  canJoin: boolean;
  /** Show «Meld deg av» — a participant can leave until they have played a round. */
  canLeave: boolean;
};

export function leagueSelfServiceState(
  input: LeagueSelfServiceInput,
): LeagueSelfServiceState {
  const isClub = input.groupId !== null;
  return {
    canJoin:
      isClub && input.status === 'draft' && input.isClubMember && !input.isParticipant,
    canLeave:
      isClub && input.status !== 'finished' && input.isParticipant && !input.hasPlayed,
  };
}
