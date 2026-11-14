/**
 * What `/api/aeresbrett` sends the app (#2259): the season's honour board in three
 * tabs. Pure, so the shaping is tested without a database; the route reads the counts.
 *
 * Privacy (#1022, #1193): self-registered strangers can open the board, so names go
 * through `formatPublicName` («Marte L.») and nothing else about a player leaves: no
 * user id, game, date or stroke. A player with neither name nor nickname is left out.
 */
import { nameInitials } from '@/lib/names/initials';
import { formatPublicName } from '@/lib/names/formatPublicName';
import {
  rankBoard,
  soleLeader,
  topTen,
  viewerPlace,
  type BoardEntry,
  type RankedEntry,
  type ViewerPlace,
} from '@/lib/stats/aeresbrett';

export type AeresbrettRow = {
  place: number;
  name: string;
  initials: string;
  count: number;
  isViewer: boolean;
};

export type AeresbrettMe = ViewerPlace;

export type AeresbrettBoard = { rows: AeresbrettRow[]; me: AeresbrettMe | null };

export type AeresbrettView = {
  /** `null` when neither this year nor last year has a finished round. */
  seasonYear: number | null;
  /** The season is a past year, so the leader is «Årets spiller», not «Leder sesongen». */
  seasonOver: boolean;
  boards: {
    wins: AeresbrettBoard & { leader: AeresbrettRow | null };
    /** `null` when the birdie read failed; the other two tabs still work. */
    birdies: AeresbrettBoard | null;
    rounds: AeresbrettBoard;
  };
};

type Counts = ReadonlyArray<readonly [string, number]>;

export type AeresbrettInput = {
  seasonYear: number | null;
  /** The Oslo year right now. */
  currentYear: number;
  viewerUserId: string;
  wins: Counts;
  rounds: Counts;
  /** `null` when the birdie read failed. */
  birdies: Counts | null;
  names: ReadonlyArray<readonly [string, string]>;
  nicknames: ReadonlyArray<readonly [string, string]>;
};

export function buildAeresbrettView(input: AeresbrettInput): AeresbrettView {
  const names = new Map(input.names);
  const nicknames = new Map(input.nicknames);

  const rank = (counts: Counts): RankedEntry[] => {
    const entries: BoardEntry[] = [];
    for (const [userId, count] of counts) {
      const name = formatPublicName({
        name: names.get(userId) ?? null,
        nickname: nicknames.get(userId) ?? null,
      });
      if (name) entries.push({ userId, name, count });
    }
    return rankBoard(entries);
  };

  const row = (entry: RankedEntry): AeresbrettRow => ({
    place: entry.place,
    name: entry.name,
    initials: nameInitials(entry.name),
    count: entry.count,
    isViewer: entry.userId === input.viewerUserId,
  });

  const board = (counts: Counts): AeresbrettBoard & { ranked: RankedEntry[] } => {
    const ranked = rank(counts);
    return {
      ranked,
      rows: topTen(ranked).map(row),
      me: viewerPlace(ranked, input.viewerUserId),
    };
  };

  const wins = board(input.wins);
  const leader = soleLeader(wins.ranked);
  const rounds = board(input.rounds);
  const birdies = input.birdies ? board(input.birdies) : null;

  return {
    seasonYear: input.seasonYear,
    seasonOver: input.seasonYear !== null && input.seasonYear < input.currentYear,
    boards: {
      wins: { rows: wins.rows, me: wins.me, leader: leader ? row(leader) : null },
      birdies: birdies ? { rows: birdies.rows, me: birdies.me } : null,
      rounds: { rows: rounds.rows, me: rounds.me },
    },
  };
}
