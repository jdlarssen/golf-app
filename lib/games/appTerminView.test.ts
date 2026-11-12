import { describe, it, expect } from 'vitest';
import { buildAppTerminView } from './appTerminView';
import { buildTerminEntries, type GameSeats } from './terminliste';
import type {
  DiscoverableClubGame,
  DiscoverableFriendGame,
  DiscoverableOpenGame,
  PendingRequest,
} from './getDiscoverableGames';
import type { GameSocialProof } from './socialProof';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Type A (#2838): the app's terminliste is the website's. Both go through
 * `buildTerminEntries`, so a row, its button and its seats are the same for the
 * same user and the same data (AGENTS.md trap 4); the view only adds what the
 * app prints (format name, team size, social proof).
 */

const STABLEFORD: GameModeConfig = { kind: 'stableford', team_size: 1, points_table: 'standard' };

function open(over: Partial<DiscoverableOpenGame> = {}): DiscoverableOpenGame {
  return {
    id: 'o1',
    name: 'Åpen runde',
    short_id: 'open0001',
    scheduled_tee_off_at: '2026-11-14T07:20:00Z',
    course_name: 'Byneset North',
    registration_mode: 'open',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    start_type: 'first_tee',
    ...over,
  };
}

function club(over: Partial<DiscoverableClubGame> = {}): DiscoverableClubGame {
  return {
    id: 'c1',
    name: 'Klubbmesterskapet',
    short_id: 'club0001',
    scheduled_tee_off_at: '2026-11-15T07:20:00Z',
    course_name: 'Byneset North',
    registration_mode: 'invite_only',
    group_name: 'Byneset GK',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    start_type: 'first_tee',
    ...over,
  };
}

function friend(over: Partial<DiscoverableFriendGame> = {}): DiscoverableFriendGame {
  return {
    id: 'f1',
    name: 'Fredagsrunden',
    short_id: 'frnd0001',
    scheduled_tee_off_at: '2026-11-13T15:00:00Z',
    course_name: 'Byneset South',
    registration_mode: 'manual_approval',
    joinMode: 'request',
    game_mode: 'stableford',
    mode_config: STABLEFORD,
    hole_segment: 'full',
    start_type: 'first_tee',
    ...over,
  };
}

const REQUEST: PendingRequest = {
  id: 'r1',
  game_id: 'g9',
  short_id: 'pend0001',
  game_name: 'Torsdagsrunden',
  team_name: null,
  is_team_captain: false,
  created_at: '2026-11-10T10:00:00Z',
};

const PROOF: GameSocialProof = { joinedCount: 3, knownFriendNames: ['Kari N.'], knownFriendOverflow: 0 };

describe('buildAppTerminView', () => {
  const data = {
    clubGames: [club()],
    friendGames: [friend(), friend({ id: 'o1', name: 'Samme runde som en åpen' })],
    openGames: [open(), open({ id: 'o2', name: 'Full runde', short_id: 'open0002' })],
    pendingRequests: [REQUEST],
  };
  const seats = new Map<string, GameSeats>([
    ['o2', { kind: 'capped', cap: 8, held: 8 }],
    ['o1', { kind: 'capped', cap: 8, held: 6 }],
  ]);

  it('gives the website’s rows, buttons and seats, in the website’s order', () => {
    const view = buildAppTerminView(data, seats, {});
    const web = buildTerminEntries(data, seats);
    expect(
      view.entries.map(({ id, source, cta, capacity, full, short_id }) => ({
        id,
        source,
        cta,
        capacity,
        full,
        short_id,
      })),
    ).toEqual(
      web.map(({ id, source, cta, capacity, full, short_id }) => ({
        id,
        source,
        cta,
        capacity,
        full,
        short_id,
      })),
    );
  });

  it('lists a game under more than one source once (club beats friend beats open)', () => {
    const ids = buildAppTerminView(data, seats, {}).entries.map((e) => e.id);
    expect(ids).toEqual(['c1', 'f1', 'o1', 'o2']);
  });

  it('marks a capped round at its cap as full', () => {
    const full = buildAppTerminView(data, seats, {}).entries.find((e) => e.id === 'o2');
    expect(full).toMatchObject({ full: true, capacity: { cap: 8, held: 8 } });
  });

  it('adds the format name from the website’s label, and the team size', () => {
    const view = buildAppTerminView(
      { openGames: [open({ game_mode: 'best_ball' })], pendingRequests: [] },
      new Map(),
      {},
    );
    // Best ball is signed up for as pairs: the seat rule's fixed team size.
    expect(view.entries[0]).toMatchObject({ modeLabel: 'Best ball', teamSize: 2 });
    const solo = buildAppTerminView({ openGames: [open()], pendingRequests: [] }, new Map(), {});
    expect(solo.entries[0]).toMatchObject({ modeLabel: 'Stableford', teamSize: 1 });
  });

  it('attaches the social proof per row, or null', () => {
    const view = buildAppTerminView(data, seats, { o1: PROOF });
    expect(view.entries.map((e) => [e.id, e.socialProof])).toEqual([
      ['c1', null],
      ['f1', null],
      ['o1', PROOF],
      ['o2', null],
    ]);
  });

  it('carries the pending requests as they are', () => {
    expect(buildAppTerminView(data, seats, {}).pendingRequests).toEqual([REQUEST]);
  });

  it('an empty list is empty rows and no requests', () => {
    expect(buildAppTerminView({ pendingRequests: [] }, new Map(), {})).toEqual({
      entries: [],
      pendingRequests: [],
    });
  });

  it('carries no address and no user id anywhere in the wire shape', () => {
    const json = JSON.stringify(buildAppTerminView(data, seats, { o1: PROOF }));
    expect(json).not.toMatch(/@|user_id|userId|email/);
  });
});
