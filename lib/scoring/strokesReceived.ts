/**
 * Slag en side faktisk mottar i én match (#1545).
 *
 * Banehandicapet er et 18-hulls-tall, men slagene deles ut per hull etter
 * stroke index. Spilles bare en del av banen — en splittet cup-dag går front 9
 * og back 9 hver for seg — havner bare noen av slagene på hullene som faktisk
 * spilles. En side med 5 slag i differanse mottar 3 av dem på front 9, fordi
 * stroke index 2 og 4 ligger på hull 15 og 18.
 *
 * Å presentere 18-hulls-differansen ved siden av en tabell som bare deler ut
 * tre slag er den vanligste kilden til «hvor ble de to andre av». Denne
 * summerer det som faktisk står i hullradene i stedet.
 */
export interface StrokeHoleRow {
  holeNumber: number;
  /** Slag tildelt siden på dette hullet — 0 på siden som ikke får slag. */
  extra: number;
}

export interface StrokesReceived {
  /** Sum slag mottatt over hullene i matchen. */
  count: number;
  /** Hullnumrene der siden får minst ett slag, i rekkefølge. */
  holes: number[];
}

export function strokesReceived(rows: StrokeHoleRow[]): StrokesReceived {
  let count = 0;
  const holes: number[] = [];
  for (const row of rows) {
    if (row.extra <= 0) continue;
    count += row.extra;
    holes.push(row.holeNumber);
  }
  return { count, holes };
}
