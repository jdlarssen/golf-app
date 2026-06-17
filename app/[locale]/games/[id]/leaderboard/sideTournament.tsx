import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { firstName } from '@/lib/firstName';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  calculateSideTournament,
  type SideTournamentInput,
  type SideWinner,
} from '@/lib/scoring/sideTournament';
import type { GameForHole } from '@/lib/games/getGameWithPlayers';
import { LeaderboardTabs } from './LeaderboardTabs';
import {
  SideTournamentView,
  type SideTournamentTeam,
} from './SideTournamentView';
import { MatchplaySideTournamentSection } from './MatchplaySideTournamentSection';
import { getLeaderboardContext, fetchSideWinners } from './leaderboardContext';
import type { SideWinnerRow, SideTournamentPlayer } from './leaderboardTypes';

/**
 * Format-uavhengig data-kjerne for sideturneringen. Henter `game_side_winners`,
 * bygger per-spiller netto/brutto, grupperer lag (`teamGrouping`), og kjører
 * `calculateSideTournament`. Returnerer akkurat de propsene `SideTournamentView`
 * konsumerer — gjenbrukes både av tabs-stien (score-/podium-formater, se
 * `renderSideTournamentTabs`) og av matchplay-seksjonen (#585), som rendrer
 * de samme dataene kompakt under duell-kortet i stedet for i en fane.
 */
export async function computeSideTournament(opts: {
  gameId: string;
  game: GameForHole;
  gwp: { players: SideTournamentPlayer[] };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  // Scores for the whole game, already fetched once by LeaderboardBody. Passed
  // through here so the side-tournament path reuses them instead of issuing a
  // second identical `scores` query in the same render tree.
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  /** Lag-format → 'byTeamNumber'; individuelt/pott-format → 'solo'. */
  teamGrouping: 'solo' | 'byTeamNumber';
}) {
  const [tc, { supabase }] = await Promise.all([
    getTranslations('leaderboard.common'),
    getLeaderboardContext(),
  ]);
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, teamGrouping } = opts;

  const sideWinnerRows: SideWinnerRow[] = await fetchSideWinners(supabase, gameId);

  // coursePars: 18-element par-array indexed by hole-1 (coursePars[0] = par
  // for hull 1). Bruker hull-nummer-oppslag for å unngå å forskyve pars ved
  // sparse course-data — fallback til 4 kun for hull som genuint mangler.
  const parByHole = new Map<number, number>();
  const siByHole = new Map<number, number>();
  for (const h of rawHolesRows) {
    parByHole.set(h.hole_number, h.par_mens);
    siByHole.set(h.hole_number, h.stroke_index);
  }
  const coursePars: number[] = [];
  const courseStrokeIndices: number[] = [];
  for (let h = 1; h <= 18; h++) {
    coursePars.push(parByHole.get(h) ?? 4);
    // SI-fallback: bruk hull-nummer hvis raden mangler — hardest_hole_winner
    // gater på løst SI=1, så en sparse-course-fallback er trygg.
    courseStrokeIndices.push(siByHole.get(h) ?? h);
  }

  // Per-spiller perHoleGross + perHoleNetto. Henter rå-scores siden
  // sideturneringen krever brutto OG netto per hull — stableford-result-en
  // bærer kun stableford-poeng. Filtrerer ut spillere uten users (defensiv;
  // RLS slipper kun gjennom registrerte spillere på et finished-spill).
  // WD (#386): trukne spillere deltar ikke i sideturneringen.
  const eligiblePlayers = gwp.players.filter((p) => p.users != null && p.withdrawn_at == null);

  // Rå-scores er allerede hentet én gang av LeaderboardBody og sendt hit som
  // `rawScoresRows` — gjenbruk dem i stedet for å fyre en ny identisk `scores`-
  // query i samme render-tre (#416). Samme tabell, samme game_id-filter.
  const scoresByPlayer = new Map<string, Map<number, number>>();
  for (const s of rawScoresRows) {
    if (s.strokes == null) continue;
    let inner = scoresByPlayer.get(s.user_id);
    if (!inner) {
      inner = new Map();
      scoresByPlayer.set(s.user_id, inner);
    }
    inner.set(s.hole_number, s.strokes);
  }

  type PerHole = {
    userId: string;
    perHoleGross: Array<number | null>;
    perHoleNetto: Array<number | null>;
  };
  const perHolePerPlayer: PerHole[] = eligiblePlayers.map((p) => {
    const ch = p.course_handicap ?? 0;
    const gross: Array<number | null> = new Array(18).fill(null);
    const netto: Array<number | null> = new Array(18).fill(null);
    const playerScores = scoresByPlayer.get(p.user_id);
    if (playerScores) {
      for (let h = 1; h <= 18; h++) {
        const grossVal = playerScores.get(h);
        if (grossVal == null) continue;
        const si = siByHole.get(h) ?? 18;
        const extra = strokesForHole(ch, si);
        gross[h - 1] = grossVal;
        netto[h - 1] = grossVal - extra;
      }
    }
    return { userId: p.user_id, perHoleGross: gross, perHoleNetto: netto };
  });

  // Lag-grupperinger: par-stableford bruker eksisterende team_number; solo
  // mapper hver spiller til en team of 1 med løpende teamId. Solo-mapping
  // gjør at SideTournamentView kan rendre én rad per spiller med spillernavn
  // som label, og at lag-aggregerte kategorier faller bort som forventet.
  type TeamGroup = {
    teamId: number;
    label: string;
    userIds: string[];
  };
  const teamGroups: TeamGroup[] = [];
  if (teamGrouping === 'byTeamNumber') {
    const byTeam = new Map<number, string[]>();
    for (const p of eligiblePlayers) {
      const t = p.team_number;
      if (t == null || t === 0) continue;
      const arr = byTeam.get(t) ?? [];
      arr.push(p.user_id);
      byTeam.set(t, arr);
    }
    const teamNumbers = [...byTeam.keys()].sort((a, b) => a - b);
    for (const t of teamNumbers) {
      teamGroups.push({
        teamId: t,
        label: tc('teamLabel', { number: t }),
        userIds: byTeam.get(t) ?? [],
      });
    }
  } else {
    const unknownPlayer = tc('unknownPlayer');
    eligiblePlayers.forEach((p, idx) => {
      const name = p.users?.name ?? unknownPlayer;
      teamGroups.push({
        teamId: idx + 1,
        label: firstName(name) ?? name,
        userIds: [p.user_id],
      });
    });
  }

  // Best ball per hull per lag. For solo (team of 1) er det bare
  // spillerens egen netto; for par-stableford er det MIN av lagets to
  // spillere per hull (null hvis alle mangler scoren).
  const nettoBestBallPerHole = teamGroups.map((tg) => {
    const perHoleNetto: Array<number | null> = new Array(18).fill(null);
    for (let h = 0; h < 18; h++) {
      const nettos = tg.userIds
        .map((uid) => perHolePerPlayer.find((p) => p.userId === uid)?.perHoleNetto[h])
        .filter((v): v is number => typeof v === 'number');
      if (nettos.length > 0) perHoleNetto[h] = Math.min(...nettos);
    }
    return { teamId: tg.teamId, perHoleNetto };
  });

  const sideWinnersForInput: SideWinner[] = sideWinnerRows
    .filter(
      (w): w is SideWinnerRow & { position: 1 | 2 } =>
        w.position === 1 || w.position === 2,
    )
    .map((w) => ({
      category: w.category,
      position: w.position,
      winnerUserId: w.winner_user_id,
    }));

  const ldCount = game.side_ld_count as 0 | 1 | 2;
  const ctpCount = game.side_ctp_count as 0 | 1 | 2;

  const sideInput: SideTournamentInput = {
    config: {
      enabled: true,
      ldCount,
      ctpCount,
      disabledCategories: game.side_disabled_categories ?? [],
    },
    teams: teamGroups.map((tg) => ({ teamId: tg.teamId, userIds: tg.userIds })),
    coursePars,
    courseStrokeIndices,
    playerScoresPerHole: perHolePerPlayer,
    nettoBestBallPerHole,
    sideWinners: sideWinnersForInput,
  };

  const sideResult = calculateSideTournament(sideInput);

  const sideTeams: SideTournamentTeam[] = teamGroups.map((tg) => ({
    teamId: tg.teamId,
    label: tg.label,
    members: tg.userIds.map((uid) => {
      const p = eligiblePlayers.find((q) => q.user_id === uid);
      const name = p?.users?.name ?? tc('unknownPlayer');
      const nickname = p?.users?.nickname ?? null;
      return {
        userId: uid,
        displayName: formatRevealName(name, nickname),
        firstName:
          firstName(name) ?? formatRevealName(name, nickname) ?? '?',
      };
    }),
  }));

  return {
    teams: sideTeams,
    result: sideResult,
    ldCount,
    ctpCount,
    sideWinners: sideWinnerRows.map((w) => ({
      category: w.category,
      position: w.position,
      winnerUserId: w.winner_user_id,
    })),
    coursePars,
    disabledCategories: game.side_disabled_categories ?? [],
  };
}

/**
 * Tabs-stien for score-/podium-formater: pakker `mainContent` (podium/view) +
 * `SideTournamentView` i `LeaderboardTabs` under en delt AppShell + TopBar.
 * Data bygges av `computeSideTournament`; denne eier kun chrome + tabs.
 */
export async function renderSideTournamentTabs(opts: {
  gameId: string;
  game: GameForHole;
  gwp: { players: SideTournamentPlayer[] };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
  backHref: string;
  mainContent: ReactNode;
  /** Lag-format → 'byTeamNumber'; individuelt/pott-format → 'solo'. */
  teamGrouping: 'solo' | 'byTeamNumber';
}) {
  const { gameId, game, gwp, rawHolesRows, rawScoresRows, backHref, mainContent, teamGrouping } = opts;
  const data = await computeSideTournament({
    gameId,
    game,
    gwp,
    rawHolesRows,
    rawScoresRows,
    teamGrouping,
  });
  return (
    <AppShell>
      <TopBar backHref={backHref} kicker={game.name} />
      <LeaderboardTabs mainContent={mainContent} sideContent={<SideTournamentView {...data} />} />
    </AppShell>
  );
}

/**
 * Bygger sideturnering-seksjonen som matchplay-duellkortene rendrer kompakt
 * under duell-resultatet (#585). De to duell-sidene er lag 1/2
 * (`teamGrouping: 'byTeamNumber'` — validatoren håndhever `team_number ∈ {1,2}`).
 * Returnerer `undefined` når spillet ikke er `finished`, ikke har sideturnering
 * på, eller ingen kvalifiserte lag finnes (f.eks. begge sider trukket) — da er
 * matchplay-view-en byte-identisk med før.
 */
export async function renderMatchplaySideSection(opts: {
  gameId: string;
  game: GameForHole;
  gwp: { players: SideTournamentPlayer[] };
  rawHolesRows: { hole_number: number; par_mens: number; par_ladies: number; par_juniors: number; stroke_index: number }[];
  rawScoresRows: { user_id: string; hole_number: number; strokes: number | null }[];
}): Promise<ReactNode> {
  const { game } = opts;
  if (game.status !== 'finished' || !game.side_tournament_enabled) return undefined;
  const data = await computeSideTournament({ ...opts, teamGrouping: 'byTeamNumber' });
  if (data.teams.length === 0) return undefined;
  return <MatchplaySideTournamentSection {...data} />;
}
