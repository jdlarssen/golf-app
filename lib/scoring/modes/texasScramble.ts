// Texas scramble-scoring (issue #44): lagene velger beste slag, alle slår
// derfra — én ball per lag, én score per lag per hull.
//
// Lag-handicap: NGF-aggregat. teamHandicap = round(combinedCourseHandicap ×
// team_handicap_pct / 100). Default fra validator: 25 % for 2-mannslag,
// 10 % for 4-mannslag. Allokeres per hull via vanlig SI-allokering.
//
// Lag-score-lagring: en lexicographically utvalgt «kaptein» (minste userId
// per lag) eier scores-radene. Andre lag-medlemmer kan taste i UI; tap fra
// hvem som helst skriver til kaptein-raden (entered_by = den som tastet).
// Resultatet er ett delt scorekort per lag uten ny tabell.
//
// Ranking: lavest totalNet vinner, med 5-tier tie-break-cascade fra
// `rankTeams` på per-hull team_net-arrays. Samme padding-strategi som
// bestBall (0-padding for missing hull i ranking-arrayet; UI viser
// missingHoles separat slik at sammenligninger kan flagges som partial).

import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { strokesForHole } from '../strokeAllocation';
import { rankTeams } from '../tiebreaker';
import { parFor } from './parResolver';
import type {
  ScoringContext,
  ScoringPlayer,
  TexasScrambleResult,
  TexasScrambleTeamLine,
  TexasScrambleHoleRow,
  TexasScramblePlayerCell,
} from './types';

/**
 * Velger lag-kaptein for Texas-scoring. Wrapper rundt felles helper
 * `pickTeamCaptain` (i `lib/games/teamCaptain.ts`) som også brukes av
 * scorekort-flaten for å resolve captain når non-captain-medlemmer åpner
 * scorekortet.
 */
function pickCaptain(members: ScoringPlayer[]): string {
  return pickTeamCaptain(members.map((m) => m.userId));
}

/**
 * Beregner Texas scramble-leaderboard fra en ScoringContext. Returnerer
 * én rad per lag, sortert (per teams-array) på teamNumber stigende.
 * Ranking-feltet `rank` reflekterer 1.-plass-finish (lavest totalNet vinner).
 *
 * Forutsetninger:
 *  - Spillere uten `teamNumber` hoppes over (filtreres ut). Validatoren
 *    i `lib/games/gamePayload.ts` håndhever lag-tilordning ved publish.
 *  - `mode_config.kind === 'texas_scramble'` — andre kinds gir defensiv
 *    fallback med team_handicap_pct = 0 (gross-modus).
 */
export function compute(ctx: ScoringContext): TexasScrambleResult {
  const handicapPct =
    ctx.game.mode_config.kind === 'texas_scramble'
      ? ctx.game.mode_config.team_handicap_pct
      : 0;

  const holesSorted = [...ctx.holes].sort((a, b) => a.number - b.number);
  const grossByKey = new Map<string, number | null>();
  for (const s of ctx.scores) {
    grossByKey.set(`${s.userId}#${s.holeNumber}`, s.gross);
  }

  // Gruppér spillere på teamNumber. Filtrer ut spillere uten team — de
  // hoppes over i scoring (validation gjøres i payload-laget).
  const teamPlayers = new Map<number, ScoringPlayer[]>();
  for (const p of ctx.players) {
    if (p.teamNumber === null) continue;
    const arr = teamPlayers.get(p.teamNumber) ?? [];
    arr.push(p);
    teamPlayers.set(p.teamNumber, arr);
  }

  const teamNumbers = [...teamPlayers.keys()].sort((a, b) => a - b);

  const baseLines = teamNumbers.map(
    (teamNumber): Omit<TexasScrambleTeamLine, 'rank' | 'tiedWith'> => {
      const groupMembers = teamPlayers.get(teamNumber) ?? [];
      const captainUserId = pickCaptain(groupMembers);

      // Sorter members lexicographically og marker kaptein. UI render
      // får dermed deterministisk rekkefølge med kaptein først.
      const sortedMembers = [...groupMembers].sort((a, b) =>
        a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
      );
      const members: TexasScramblePlayerCell[] = sortedMembers.map((m) => ({
        userId: m.userId,
        courseHandicap: m.courseHandicap,
        isCaptain: m.userId === captainUserId,
      }));

      const combinedCourseHandicap = members.reduce(
        (sum, m) => sum + m.courseHandicap,
        0,
      );
      const teamHandicap = Math.round((combinedCourseHandicap * handicapPct) / 100);

      // Kapteinen eier scores-raden, og siden Texas-laget spiller én ball
      // bruker vi kapteinens teeGender som lag-referanse for par-display.
      // (Lag-medlemmer kan ha ulike tee-genders i prinsippet, men kun én
      // par-verdi gir mening for delt scorekort.) Faller tilbake til hole.par
      // når parByGender ikke er satt. #240.
      const captainPlayer = groupMembers.find((m) => m.userId === captainUserId);

      const holes: TexasScrambleHoleRow[] = holesSorted.map((hole) => {
        const teamGross = grossByKey.get(`${captainUserId}#${hole.number}`) ?? null;
        const teamExtraStrokes = strokesForHole(teamHandicap, hole.strokeIndex);
        const teamNet = teamGross === null ? null : teamGross - teamExtraStrokes;
        return {
          holeNumber: hole.number,
          par: parFor(hole, captainPlayer?.teeGender),
          strokeIndex: hole.strokeIndex,
          teamGross,
          teamExtraStrokes,
          teamNet,
        };
      });

      const missingHoles: number[] = [];
      let totalNet = 0;
      let totalGross = 0;
      for (const h of holes) {
        if (h.teamNet === null || h.teamGross === null) {
          missingHoles.push(h.holeNumber);
        } else {
          totalNet += h.teamNet;
          totalGross += h.teamGross;
        }
      }

      return {
        teamNumber,
        members,
        combinedCourseHandicap,
        teamHandicap,
        holes,
        totalNet,
        totalGross,
        missingHoles,
      };
    },
  );

  // Bygg 18-lange teamNet-arrays for ranking. Missing-hull padder med 0 —
  // samme behandling som bestBall. UI bruker missingHoles separat for
  // å flagge sammenligninger som partial.
  const ranked = rankTeams(
    baseLines.map((l) => {
      const arr: number[] = [];
      for (let i = 0; i < 18; i++) {
        const h = l.holes[i];
        arr.push(h?.teamNet ?? 0);
      }
      return { id: l.teamNumber, holes: arr };
    }),
  );
  const rankById = new Map(ranked.map((r) => [r.id, r]));

  const teams: TexasScrambleTeamLine[] = baseLines.map((l) => {
    const r = rankById.get(l.teamNumber);
    return {
      ...l,
      rank: r?.rank ?? 0,
      tiedWith: r?.tiedWith ?? [],
    };
  });

  return { kind: 'texas_scramble', teams };
}
