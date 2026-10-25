import type { LeagueSnapshot } from './getLigaSnapshot';
import type { AppLeagueParticipantDetails, AppLeagueView } from './appLeagueView';
import { normalizeSimSettings } from './simSettings';
import type { LeagueFormat, LeagueScoring, LeagueStatus, StandingsModel } from './types';

const SCORINGS: readonly LeagueScoring[] = ['net', 'gross', 'both'];
const MODELS: readonly StandingsModel[] = ['total', 'average', 'best_n', 'points'];
const STATUSES: readonly LeagueStatus[] = ['draft', 'active', 'finished'];

/**
 * The app's league page from the same snapshot the web page renders (#2638),
 * so the table and the settings have one home (`getLigaSnapshot`). Pure: the
 * route has already loaded the snapshot and passed the viewer gate.
 *
 * `details` is the full name and HCP per participant, which the route reads
 * only for a caller who is a participant; without it both stay null.
 */
export function buildAppLeagueView(
  snapshot: LeagueSnapshot,
  userId: string,
  details: ReadonlyMap<string, AppLeagueParticipantDetails> | null = null,
): AppLeagueView {
  const { league, rounds, participants, standings } = snapshot;
  const scoring = SCORINGS.find((s) => s === league.scoring) ?? 'net';
  // The league's own axis: gross in a gross league, net otherwise ('both' is
  // legacy and ranks net first, as the web panel does).
  const table = (scoring === 'gross' ? standings.gross : standings.net) ?? standings.net ?? standings.gross;

  return {
    league: {
      id: league.id,
      name: league.name,
      status: STATUSES.find((s) => s === league.status) ?? 'draft',
      // DB CHECK (0087) allows the three formats only.
      format: league.format as LeagueFormat,
      scoring,
      standingsModel: MODELS.find((m) => m === league.standings_model) ?? 'total',
      bestN: league.best_n_count,
      isSimulator: league.is_simulator,
      simSettings: normalizeSimSettings(league.sim_settings),
      seasonStart: league.season_start,
      seasonEnd: league.season_end,
    },
    rounds: rounds.map((r) => ({
      id: r.id,
      label: r.label,
      sequence: r.sequence,
      opensAt: r.opensAt,
      closesAt: r.closesAt,
      ready: r.courseId !== null && r.teeBoxId !== null,
      teeName: r.teeName,
      delivered: r.deliveredUserIds,
      inProgress: r.inProgressUserIds,
      simSettings: r.simSettings,
      overriddenKeys: r.overriddenKeys,
      settingsLocked: r.settingsLocked,
    })),
    participants: participants.map((p) => ({
      userId: p.userId,
      name: p.nickname?.trim() || p.name?.trim() || null,
      fullName: details?.get(p.userId)?.fullName ?? null,
      hcpIndex: details?.get(p.userId)?.hcpIndex ?? null,
    })),
    standings: (table?.rows ?? []).map((row) => ({
      userId: row.userId,
      rank: row.rank,
      value: row.value,
      ranked: row.ranked,
      roundsPlayed: row.roundsPlayed,
      perRound: row.perRound.map((c) => ({
        roundId: c.roundId,
        value: c.value,
        points: c.points,
        penalised: c.penalised,
      })),
    })),
    me: { userId, isParticipant: participants.some((p) => p.userId === userId) },
  };
}
