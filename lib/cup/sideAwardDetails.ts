// Sidepoeng hull-for-hull for cup-resultatsiden (#1496). Ren funksjon over
// snapshot-ens `sideAwards` — zero IO, ingen datoer, ingen ny beregning.
//
// Perspektivet er et annet enn per-spiller-regnskapet (#1497): der er svaret
// «hvilke poeng samlet DU inn», her er det «hva skjedde på hvert hull». Det er
// de SAMME poengene sett fra hullet, aldri ekstra poeng — derfor leses
// `points`/tellerne rått fra snapshot-en og summeres aldri opp mot
// `leaderboard.sideAwardPoints`.
//
// Ett hjem for regelen: registrert-vs-uregistrert klassifiseres via
// `isSideAwardRegistered` (samme helper som finishTournament-gaten og
// CupManagement bruker), aldri utledet på nytt her.

import type { CupRoster, CupSideAwardSnapshot } from './getCupSnapshot';
import { preferredName } from './computeCupPlayerPoints';
import { isSideAwardRegistered } from './sideAwardsRegistered';

/**
 * Utfallet for én ctp/ld-vinnerplass:
 *  - `won` — arrangøren har tastet en vinner.
 *  - `noWinner` — arrangøren har svart «ingen vant» (#1530).
 *  - `unregistered` — ikke tastet ennå (typisk en tvangsavsluttet cup). Nøytral
 *    tom-tilstand, ikke en feil.
 */
export type CupSideAwardOutcome = 'won' | 'noWinner' | 'unregistered';

export type CupSideAwardWinnerRow = {
  id: string;
  kind: 'ctp' | 'ld';
  holeNumber: number;
  points: number;
  slot: number;
  slotCount: number;
  /** «1 av 3» vises kun når plassen faktisk har søsken (gamle cuper: `false`). */
  showSlot: boolean;
  outcome: CupSideAwardOutcome;
  /** Vinnerens visningsnavn — kun ved `won`, ellers `null`. */
  winnerName: string | null;
  /** `null` også for en vinner utenfor rosteret — ingen lag-attribusjon da. */
  winnerTeam: 1 | 2 | null;
};

export type CupSideAwardGirTeamRow = {
  team: 1 | 2;
  /** `null` = ikke registrert, `0` = registrert null GIR. */
  count: number | null;
  /** Teller × poeng per GIR. `0` når telleren mangler. */
  points: number;
};

export type CupSideAwardGirRow = {
  id: string;
  kind: 'gir';
  holeNumber: number;
  /** Poeng per klart GIR — ikke radens total. */
  points: number;
  maxPerTeam: number;
  /** `false` når minst én av lag-tellerne mangler (`isSideAwardRegistered`). */
  registered: boolean;
  teams: [CupSideAwardGirTeamRow, CupSideAwardGirTeamRow];
};

export type CupSideAwardDetailRow = CupSideAwardWinnerRow | CupSideAwardGirRow;

export type CupSideAwardHoleGroup = {
  holeNumber: number;
  rows: CupSideAwardDetailRow[];
};

export type CupSideAwardDetailsInput = {
  sideAwards: CupSideAwardSnapshot[];
  roster: CupRoster;
  /**
   * Visningsnavnet for en spiller uten navn og uten kallenavn (#1527). Påkrevd
   * — biblioteket kjenner ingen locale. Brukes også for en vinner-ID som ikke
   * finnes i rosteret (defensivt, samme toleranse som computeCupPlayerPoints).
   */
  unknownLabel: string;
};

/**
 * Grupperer sidepoengene per hull, med hull stigende og radene innenfor hvert
 * hull i snapshot-rekkefølge (kind → slot). Tom input gir tom liste — kalleren
 * viser da ingen seksjon.
 */
export function buildSideAwardDetails(
  input: CupSideAwardDetailsInput,
): CupSideAwardHoleGroup[] {
  const { sideAwards, roster, unknownLabel } = input;

  const nameByUserId = new Map<string, string>();
  for (const p of [...roster.team1, ...roster.team2]) {
    if (!nameByUserId.has(p.userId)) nameByUserId.set(p.userId, preferredName(p, unknownLabel));
  }

  const byHole = new Map<number, CupSideAwardHoleGroup>();
  function groupFor(holeNumber: number): CupSideAwardHoleGroup {
    const existing = byHole.get(holeNumber);
    if (existing) return existing;
    const created: CupSideAwardHoleGroup = { holeNumber, rows: [] };
    byHole.set(holeNumber, created);
    return created;
  }

  for (const award of sideAwards) {
    if (award.kind === 'gir') {
      const registered = isSideAwardRegistered({
        kind: 'gir',
        team1Count: award.team1Count,
        team2Count: award.team2Count,
      });
      groupFor(award.holeNumber).rows.push({
        id: award.id,
        kind: 'gir',
        holeNumber: award.holeNumber,
        points: award.points,
        maxPerTeam: award.maxPerTeam,
        registered,
        teams: [
          girTeamRow(1, award.team1Count, award.points),
          girTeamRow(2, award.team2Count, award.points),
        ],
      });
      continue;
    }

    const registered = isSideAwardRegistered({
      kind: award.kind,
      winnerUserId: award.winnerUserId,
      noWinner: award.noWinner,
    });
    const outcome: CupSideAwardOutcome = !registered
      ? 'unregistered'
      : award.winnerUserId
        ? 'won'
        : 'noWinner';

    groupFor(award.holeNumber).rows.push({
      id: award.id,
      kind: award.kind,
      holeNumber: award.holeNumber,
      points: award.points,
      slot: award.slot,
      slotCount: award.slotCount,
      showSlot: award.slotCount > 1,
      outcome,
      winnerName:
        outcome === 'won' && award.winnerUserId
          ? (nameByUserId.get(award.winnerUserId) ?? unknownLabel)
          : null,
      winnerTeam: outcome === 'won' ? award.winnerTeam : null,
    });
  }

  return Array.from(byHole.values()).sort((a, b) => a.holeNumber - b.holeNumber);
}

function girTeamRow(team: 1 | 2, count: number | null, pointsPerGir: number): CupSideAwardGirTeamRow {
  return { team, count, points: count == null ? 0 : count * pointsPerGir };
}
