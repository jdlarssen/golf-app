// Native N4 (#1828): motor-resultatet → én visning per resultatform.
//
// Switchen under er uttømmende med en `never`-vakt: får den delte motoren en ny
// `kind`, stopper `tsc` her i stedet for at telefonen viser en tom skjerm. De
// tre gatede formatene (wolf, bingo bango bongo, patsome) har egne grener med
// ærlig tekst — de kan ikke oppstå så lenge `formatGate` stenger dem, men en
// gren er billigere enn en antakelse.
//
// Ingen sortering her. Motoren har rangert radene; en `sort` til i render-laget
// ville vært en andre og konkurrerende regel for hvem som leder.
import type { ModeResult } from '../../../../../lib/scoring/modes/types';
import { nameLookup, teamLabel } from '../../lib/leaderboardModel';
import { MatchView } from './MatchView';
import { NassauView, SkinsView } from './PotViews';
import { CalmNote, LeaderTable, type LeaderColumn } from './Table';

/** Teksten for formater appen ennå ikke tegner. Aldri en krasj, aldri tomt. */
export const WEB_ONLY_RESULT_MESSAGE = 'Formatet vises på nettsiden ennå.';

const RANK: LeaderColumn = { key: 'rank', label: '#', flex: 0.5, numeric: true };
const PLAYER: LeaderColumn = { key: 'name', label: 'Navn', flex: 3 };
const TEAM: LeaderColumn = { key: 'team', label: 'Lag', flex: 3 };

export function ResultView({
  result,
  status,
  nameOf,
}: {
  result: ModeResult;
  status: string;
  nameOf: ReturnType<typeof nameLookup>;
}) {
  switch (result.kind) {
    case 'solo_strokeplay':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            PLAYER,
            { key: 'gross', label: 'Brutto', numeric: true },
            { key: 'net', label: 'Netto', numeric: true },
          ]}
          rows={result.players.map((player) => ({
            key: player.userId,
            highlight: player.rank === 1,
            cells: [
              player.rank,
              nameOf(player.userId),
              // Ingen hull spilt: «—» i stedet for 0, ellers leser en spiller
              // som ikke har begynt som runderekord.
              player.holesPlayed === 0 ? '—' : player.totalGrossStrokes,
              player.holesPlayed === 0 ? '—' : player.totalNetStrokes,
            ],
          }))}
        />
      );

    case 'stableford':
      return result.variant === 'solo' ? (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            PLAYER,
            { key: 'points', label: 'Poeng', numeric: true },
            { key: 'holes', label: 'Hull', numeric: true },
          ]}
          rows={result.players.map((player) => ({
            key: player.userId,
            highlight: player.rank === 1,
            cells: [
              player.rank,
              nameOf(player.userId),
              player.totalPoints,
              player.holesPlayed,
            ],
          }))}
        />
      ) : (
        <LeaderTable
          testID="leaderboard-table"
          columns={[RANK, TEAM, { key: 'points', label: 'Poeng', numeric: true }]}
          rows={result.teams.map((team) => ({
            key: String(team.teamNumber),
            highlight: team.rank === 1,
            cells: [
              team.rank,
              teamLabel(team.teamNumber, team.playerIds, nameOf),
              team.totalPoints,
            ],
          }))}
        />
      );

    case 'texas_scramble':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            TEAM,
            // Lag-handicapet kommer FRA motoren (`teamHandicap`) — appen har
            // ingen egen kopi av 60/40- eller prosent-formlene.
            { key: 'hcp', label: 'Lag-hcp', numeric: true },
            { key: 'net', label: 'Netto', numeric: true },
          ]}
          rows={result.teams.map((team) => ({
            key: String(team.teamNumber),
            highlight: team.rank === 1,
            cells: [
              team.rank,
              teamLabel(
                team.teamNumber,
                team.members.map((member) => member.userId),
                nameOf,
              ),
              team.teamHandicap,
              team.totalNet,
            ],
          }))}
        />
      );

    case 'best_ball':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[RANK, TEAM, { key: 'net', label: 'Netto', numeric: true }]}
          rows={result.teams.map((team) => ({
            key: String(team.teamNumber),
            highlight: team.rank === 1,
            cells: [
              team.rank,
              teamLabel(team.teamNumber, team.playerIds, nameOf),
              team.total,
            ],
          }))}
        />
      );

    case 'shamble':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            TEAM,
            { key: 'total', label: 'Sum', numeric: true },
            { key: 'holes', label: 'Hull', numeric: true },
          ]}
          rows={result.teams.map((team) => ({
            key: String(team.teamNumber),
            highlight: team.rank === 1,
            cells: [
              team.rank,
              teamLabel(team.teamNumber, team.members, nameOf),
              team.totalScore,
              team.holesCounted,
            ],
          }))}
        />
      );

    case 'nines':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            PLAYER,
            { key: 'points', label: 'Poeng', numeric: true },
            { key: 'holes', label: 'Hull', numeric: true },
          ]}
          rows={result.players.map((player) => ({
            key: player.userId,
            highlight: player.rank === 1,
            cells: [
              player.rank,
              nameOf(player.userId),
              player.totalPoints,
              player.holesScored,
            ],
          }))}
        />
      );

    case 'round_robin':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            PLAYER,
            { key: 'won', label: 'Vunnet', numeric: true },
            { key: 'lost', label: 'Tapt', numeric: true },
          ]}
          rows={result.players.map((player) => ({
            key: player.userId,
            highlight: player.rank === 1,
            cells: [
              player.rank,
              nameOf(player.userId),
              player.totalHoleWins,
              player.totalHolesLost,
            ],
          }))}
        />
      );

    case 'acey_deucey':
      return (
        <LeaderTable
          testID="leaderboard-table"
          columns={[
            RANK,
            PLAYER,
            { key: 'total', label: 'Poeng', numeric: true },
            { key: 'aces', label: 'Ess', numeric: true },
          ]}
          rows={result.players.map((player) => ({
            key: player.userId,
            highlight: player.rank === 1,
            cells: [player.rank, nameOf(player.userId), player.total, player.aces],
          }))}
        />
      );

    case 'skins':
      return <SkinsView result={result} status={status} nameOf={nameOf} />;

    case 'nassau':
      return <NassauView result={result} nameOf={nameOf} />;

    case 'singles_matchplay':
      return (
        <MatchView
          side1={{ sideNumber: 1, userIds: [result.sides[0].userId] }}
          side2={{ sideNumber: 2, userIds: [result.sides[1].userId] }}
          holes={result.holes}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          result={result.result}
          nameOf={nameOf}
        />
      );

    case 'fourball_matchplay':
      return (
        <MatchView
          side1={{
            sideNumber: 1,
            userIds: result.sides[0].players.map((player) => player.userId),
          }}
          side2={{
            sideNumber: 2,
            userIds: result.sides[1].players.map((player) => player.userId),
          }}
          holes={result.holes}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          result={result.result}
          nameOf={nameOf}
        />
      );

    // Greensome, chapman og gruesome kommer også ut som `foursomes_matchplay`
    // fra motoren — én visning dekker hele alternate-shot-familien.
    case 'foursomes_matchplay':
      return (
        <MatchView
          side1={{
            sideNumber: 1,
            userIds: result.sides[0].players.map((player) => player.userId),
          }}
          side2={{
            sideNumber: 2,
            userIds: result.sides[1].players.map((player) => player.userId),
          }}
          holes={result.holes}
          holesUp={result.holesUp}
          holesPlayed={result.holesPlayed}
          result={result.result}
          nameOf={nameOf}
        />
      );

    // Gatet i `formatGate` — kan ikke nås fra appen, men har en gren så en
    // fremtidig åpning ikke møter en tom skjerm.
    case 'wolf':
    case 'bingo_bango_bongo':
    case 'patsome':
      return <CalmNote text={WEB_ONLY_RESULT_MESSAGE} testID="leaderboard-web-only" />;

    default: {
      // `never`-vakten er kompilefeilen; returen under er fallskjermen. En
      // motor som en dag sender en kind denne app-versjonen ikke kjenner
      // (eldre app, nyere server) skal si fra, ikke rendre ingenting.
      const exhaustive: never = result;
      void exhaustive;
      return <CalmNote text={WEB_ONLY_RESULT_MESSAGE} testID="leaderboard-web-only" />;
    }
  }
}
