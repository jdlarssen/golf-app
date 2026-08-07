/**
 * Ren config↔DB-rad-mapping for cup-sidepoeng (#1489). Admin-panelet og
 * server-actions jobber med CONFIG-rader (én per type+hull, med antall);
 * DB-en lagrer én rad PER VINNER-PLASS for ctp/ld (slot 1..N, migrasjon 0156)
 * slik at vinner-registreringen per rad gjenbrukes uendret. GIR lagres som én
 * rad per hull (slot 1) med maks-per-lag; lag-tellerne fylles etter runden.
 *
 * Egen fil (ikke `sideAwardActions.ts`): 'use server'-moduler kan bare
 * eksportere async-funksjoner — rene, synkrone helpers må bo utenfor.
 */

export type SideAwardConfigInput =
  | { kind: 'ctp' | 'ld'; holeNumber: number; points: number; winnerCount: number }
  | { kind: 'gir'; holeNumber: number; points: number; maxPerTeam: number };

/** DB-formen ekspansjonen produserer — kalleren legger på tournament_id. */
export type ExpandedSideAwardRow = {
  kind: 'ctp' | 'ld' | 'gir';
  hole_number: number;
  points: number;
  slot: number;
  gir_max_per_team: number | null;
};

/** Minimumsformen grupperingen trenger — snapshot-rader oppfyller den. */
export type GroupableSideAwardRow = {
  kind: 'ctp' | 'ld' | 'gir';
  holeNumber: number;
  points: number;
  maxPerTeam: number | null;
};

export function isValidSideAward(a: SideAwardConfigInput): boolean {
  const base =
    Number.isInteger(a.holeNumber) &&
    a.holeNumber >= 1 &&
    a.holeNumber <= 18 &&
    typeof a.points === 'number' &&
    Number.isFinite(a.points) &&
    a.points > 0;
  if (!base) return false;
  if (a.kind === 'ctp' || a.kind === 'ld') {
    return Number.isInteger(a.winnerCount) && a.winnerCount >= 1 && a.winnerCount <= 10;
  }
  if (a.kind === 'gir') {
    return Number.isInteger(a.maxPerTeam) && a.maxPerTeam >= 1 && a.maxPerTeam <= 10;
  }
  return false;
}

export function expandSideAwardConfig(awards: SideAwardConfigInput[]): ExpandedSideAwardRow[] {
  return awards.flatMap((a): ExpandedSideAwardRow[] => {
    if (a.kind === 'gir') {
      return [
        {
          kind: 'gir',
          hole_number: a.holeNumber,
          points: a.points,
          slot: 1,
          gir_max_per_team: a.maxPerTeam,
        },
      ];
    }
    return Array.from({ length: a.winnerCount }, (_, i) => ({
      kind: a.kind,
      hole_number: a.holeNumber,
      points: a.points,
      slot: i + 1,
      gir_max_per_team: null,
    }));
  });
}

/**
 * Folder DB-/snapshot-rader tilbake til config-rader i første-forekomst-
 * rekkefølge (snapshot leverer sortert på kind/hull/slot). Grupperer per
 * (kind, hull, points) — samme kind+hull med ulik points kan ikke oppstå via
 * appen, men grupperingen viser det som ligger der i stedet for å krasje.
 */
export function groupSideAwardRows(rows: GroupableSideAwardRow[]): SideAwardConfigInput[] {
  const grouped = new Map<string, SideAwardConfigInput>();
  for (const row of rows) {
    if (row.kind === 'gir') {
      const key = `gir#${row.holeNumber}#${row.points}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          kind: 'gir',
          holeNumber: row.holeNumber,
          points: row.points,
          maxPerTeam: row.maxPerTeam ?? 1,
        });
      }
      continue;
    }
    const key = `${row.kind}#${row.holeNumber}#${row.points}`;
    const existing = grouped.get(key);
    if (existing && existing.kind !== 'gir') {
      existing.winnerCount += 1;
    } else {
      grouped.set(key, {
        kind: row.kind,
        holeNumber: row.holeNumber,
        points: row.points,
        winnerCount: 1,
      });
    }
  }
  return Array.from(grouped.values());
}
