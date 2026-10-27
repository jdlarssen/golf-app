/**
 * The league as the app reads it (#2638): the wire shapes of
 * `GET /api/liga` and `GET /api/liga/[id]`. The server builds them
 * (`buildAppLeagueView.ts`, `getMyLeagues.ts`); the app only renders them and
 * never computes the table or merges settings itself.
 *
 * Types only, importing nothing but the pure league modules: the native app
 * imports this file by relative path.
 */
import type { SimSettingKey, SimSettings } from './simSettings';
import type { LeagueFormat, LeagueScoring, LeagueStatus, StandingsModel } from './types';

/** One league on the app's Home («Ligaene dine»). */
export type AppLeagueSummary = {
  id: string;
  name: string;
  status: Extract<LeagueStatus, 'draft' | 'active'>;
  /** The round whose window is open now (the earliest one), or null. */
  openRound: { id: string; label: string; closesAt: string } | null;
  /** The caller has delivered the open round. */
  delivered: boolean;
  /** The caller is playing the open round now. */
  inProgress: boolean;
};

export type AppLeagueListResponse = { leagues: AppLeagueSummary[] };

export type AppLeagueRound = {
  id: string;
  label: string;
  sequence: number;
  opensAt: string;
  closesAt: string;
  /** Course and tee are set, so the round can be started. */
  ready: boolean;
  /** The round's tee, from the course selection (shown on the settings card). */
  teeName: string | null;
  /** Players who have delivered the round. */
  delivered: string[];
  /** Players who are playing the round now. */
  inProgress: string[];
  /**
   * #2661: delivered cards that wait for their marker (simulator league):
   * «Venter på godkjenning fra …» for the player, «Venter på deg som markør»
   * for the marker.
   */
  awaitingMarker: Array<{ gameId: string; userId: string; markerUserId: string }>;
  /**
   * The settings that apply to the round (`roundSimSettings`): the
   * organiser's override over the frozen default once the round has started,
   * else over today's league default.
   */
  simSettings: SimSettings;
  /** The keys the organiser overrode for this round («Endret denne runden»). */
  overriddenKeys: SimSettingKey[];
  /** A player has started the round, so its settings are fixed. */
  settingsLocked: boolean;
};

export type AppLeagueStandingCell = {
  roundId: string;
  /** Strokes to par (slagspill) or points (stableford); null = not played. */
  value: number | null;
  /** Points under the 'points' model; null otherwise. */
  points: number | null;
  /** The value is a penalty for a missed round. */
  penalised: boolean;
};

export type AppLeagueStandingRow = {
  userId: string;
  /** 1-based place among the ranked; null when not ranked. */
  rank: number | null;
  value: number;
  ranked: boolean;
  roundsPlayed: number;
  perRound: AppLeagueStandingCell[];
};

/**
 * What a participant also sees of the others (#2638, the start screen's
 * co-player list): the name for the initials and the HCP. The route reads it
 * only for a caller who is a participant, after the access gate.
 */
export type AppLeagueParticipantDetails = { fullName: string | null; hcpIndex: number | null };

export type AppLeagueParticipant = { userId: string; name: string | null } & AppLeagueParticipantDetails;

export type AppLeagueView = {
  league: {
    id: string;
    name: string;
    status: LeagueStatus;
    format: LeagueFormat;
    scoring: LeagueScoring;
    standingsModel: StandingsModel;
    bestN: number | null;
    isSimulator: boolean;
    /** The league default, normalised. */
    simSettings: SimSettings;
    seasonStart: string;
    seasonEnd: string;
  };
  rounds: AppLeagueRound[];
  /**
   * `name` is the nickname, else the name, else null. `fullName` (the
   * avatar's initials) and `hcpIndex` (the co-player list on «Start runden»)
   * are sent only to a participant of the league, else null
   * (`AppLeagueParticipantDetails`).
   */
  participants: AppLeagueParticipant[];
  /** The table on the league's own axis (net, or gross in a gross league). */
  standings: AppLeagueStandingRow[];
  me: { userId: string; isParticipant: boolean };
};
