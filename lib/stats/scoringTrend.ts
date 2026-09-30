/**
 * Geometri-bygger for den personlige scoringstrend-grafen (#936).
 *
 * Ren, I/O-fri (Type A, jf. `lib/scoring/AGENTS.md`): kallstedet
 * (`/profile/historikk`) filtrerer til komplette 18-hulls-runder, sorterer
 * eldst→nyest og sender inn `TrendRound[]`. Denne modulen oversetter score-tall
 * til SVG-koordinater — ingen DOM, ingen fetch.
 *
 * **Golf-intuisjon for y-aksen:** høyere score tegnes høyere på skjermen, så en
 * linje som FALLER betyr at scoren går ned = spilleren blir bedre. Det er den
 * naturlige lesningen for et golf-publikum (lavere er bedre).
 *
 * #2265: appens Rundedagboka leser kurven motsatt vei — bedre runder står
 * høyere, «opp er bedre» (eierbestillingen). Den sender `invertY: true`, og
 * designets geometri (`padDomain: false`, `areaBottom`). Alle valgene er
 * additive: uten dem er geometrien den webben tegner i dag.
 */

/** Formkurve-vinduet: de siste N rundene, som WHS/Golfbox (#949). */
export const MAX_TREND_ROUNDS = 20;

/** Én runde i trenden. `netto === null` ⇒ banehandicap ukjent for runden. */
export type TrendRound = {
  /** Total brutto for en komplett 18-hulls-runde. */
  brutto: number;
  /** Netto = brutto − banehandicap, eller `null` når handicap mangler. */
  netto: number | null;
};

export type TrendPoint = { x: number; y: number };

export type ScoringTrendGeometry = {
  /** viewBox-bredde/høyde polylinjene er regnet mot. */
  width: number;
  height: number;
  /** Ett punkt per runde (alle runder har brutto). */
  bruttoPoints: TrendPoint[];
  /** Kun runder med `netto != null`, i samme x-rekkefølge (hopper over hull). */
  nettoPoints: TrendPoint[];
  /** `"x,y x,y …"` klar for `<polyline points=>`. */
  bruttoPolyline: string;
  nettoPolyline: string;
  /**
   * Lukket sti under brutto-linja, ned til `areaBottom` (standard: bunnen av
   * plottet), klar for `<path d=>`. Flaten under kurven i appen (#2265).
   */
  areaPath: string;
  /** Padded y-domene som faktisk ble brukt (verst..best i score-tall). */
  yMin: number;
  yMax: number;
  /** Punktet for beste (laveste) brutto-runde — koordinat for rekord-ringen
   *  (#949). Tidligste forekomst ved likhet (rekorden ble satt da). */
  bruttoBestPoint: TrendPoint;
  /** Tilsvarende for beste netto, eller `null` når ingen runde har netto. */
  nettoBestPoint: TrendPoint | null;
};

/** Start/nå/beste for én metrikk over vinduet (#949). */
export type TrendStat = {
  /** Første (eldste) runde i vinduet. */
  start: number;
  /** Siste (nyeste) runde i vinduet. */
  now: number;
  /** Beste (laveste) verdi i vinduet. */
  best: number;
};

/** Sammendrag bak boksene: brutto alltid, netto-felt `null` ved manglende
 *  banehandicap (#949). */
export type TrendSummary = {
  brutto: TrendStat;
  netto: {
    start: number | null;
    now: number | null;
    best: number | null;
  };
};

export type ScoringTrendPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ScoringTrendOptions = {
  width?: number;
  height?: number;
  padding?: ScoringTrendPadding;
  /**
   * `true`: lavere verdi tegnes HØYERE (bedre runde står øverst). Standard
   * `false`, webbens retning (#2265).
   */
  invertY?: boolean;
  /**
   * `false`: ingen luft i domenet, så beste og dårligste verdi ligger på
   * kanten av plottet (designets geometri). Standard `true` (#2265).
   */
  padDomain?: boolean;
  /** Hvor flaten under kurven slutter. Standard: bunnen av plottet (#2265). */
  areaBottom?: number;
};

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 220;
const DEFAULT_PADDING: ScoringTrendPadding = {
  top: 16,
  right: 16,
  bottom: 20,
  left: 16,
};

/** Minste antall punkter for at en linje gir mening. */
const MIN_POINTS = 2;

/** Rund av til 2 desimaler for kompakte, stabile polyline-strenger. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toPolyline(points: TrendPoint[]): string {
  return points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' ');
}

/** Lukket sti: langs linja, ned til `bottom` og tilbake til start. */
function toAreaPath(points: TrendPoint[], bottom: number): string {
  const first = points[0];
  const last = points[points.length - 1];
  const along = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round2(p.x)},${round2(p.y)}`);
  return [
    ...along,
    `L${round2(last.x)},${round2(bottom)}`,
    `L${round2(first.x)},${round2(bottom)}`,
    'Z',
  ].join(' ');
}

/**
 * Bygg SVG-geometri for brutto- og netto-linjene.
 *
 * Returnerer `null` når det er færre enn 2 runder — én linje trenger minst to
 * punkter. Domenet (`yMin`..`yMax`) spenner over ALLE plottede verdier (brutto
 * + ikke-null netto), paddet med noen slag så linjene ikke ligger flush mot
 * kanten og en flat linje (alle scorer like) havner sentrert i stedet for å
 * dele på null.
 */
export function buildScoringTrend(
  rounds: TrendRound[],
  opts: ScoringTrendOptions = {},
): ScoringTrendGeometry | null {
  if (rounds.length < MIN_POINTS) return null;

  const width = opts.width ?? DEFAULT_WIDTH;
  const height = opts.height ?? DEFAULT_HEIGHT;
  const padding = opts.padding ?? DEFAULT_PADDING;

  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Domene over alle plottede verdier (brutto alltid, netto når den finnes).
  const values: number[] = [];
  for (const r of rounds) {
    values.push(r.brutto);
    if (r.netto != null) values.push(r.netto);
  }
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);

  // Pad domenet: ~10 % av spennet, minst 1 slag på hver side. Flat linje
  // (spenn 0) får et fast vindu så den havner midt i grafen. Uten padding
  // (`padDomain: false`) ligger ytterpunktene på kanten, og en flat linje
  // tegnes midt i plottet.
  const span = rawMax - rawMin;
  const padded = opts.padDomain ?? true;
  const pad = !padded ? 0 : span === 0 ? 2 : Math.max(1, Math.round(span * 0.1));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const domain = yMax - yMin; // > 0 med padding; 0 for en flat linje uten

  const n = rounds.length;
  const mapX = (i: number): number =>
    padding.left + (i / (n - 1)) * innerWidth;
  // Standard: høyere score (større v) → mindre svg-y → høyere på skjermen.
  // `invertY`: lavere score → mindre svg-y, så en bedre runde står høyere.
  const invert = opts.invertY ?? false;
  const mapY = (v: number): number => {
    if (domain === 0) return padding.top + innerHeight / 2;
    const fromTop = invert ? v - yMin : yMax - v;
    return padding.top + (fromTop / domain) * innerHeight;
  };

  const bruttoPoints: TrendPoint[] = rounds.map((r, i) => ({
    x: mapX(i),
    y: mapY(r.brutto),
  }));

  const nettoPoints: TrendPoint[] = [];
  rounds.forEach((r, i) => {
    if (r.netto != null) nettoPoints.push({ x: mapX(i), y: mapY(r.netto) });
  });

  // Beste-runder for rekord-ringene (#949). Strict `<` beholder den TIDLIGSTE
  // forekomsten ved likhet — rekorden ble satt første gang den ble nådd.
  let bestBruttoIdx = 0;
  for (let i = 1; i < n; i++) {
    if (rounds[i].brutto < rounds[bestBruttoIdx].brutto) bestBruttoIdx = i;
  }
  let bestNettoIdx = -1;
  for (let i = 0; i < n; i++) {
    const v = rounds[i].netto;
    if (v == null) continue;
    if (bestNettoIdx < 0 || v < rounds[bestNettoIdx].netto!) bestNettoIdx = i;
  }

  return {
    width,
    height,
    bruttoPoints,
    nettoPoints,
    bruttoPolyline: toPolyline(bruttoPoints),
    nettoPolyline: toPolyline(nettoPoints),
    areaPath: toAreaPath(bruttoPoints, opts.areaBottom ?? height - padding.bottom),
    yMin,
    yMax,
    bruttoBestPoint: bruttoPoints[bestBruttoIdx],
    nettoBestPoint:
      bestNettoIdx >= 0
        ? { x: mapX(bestNettoIdx), y: mapY(rounds[bestNettoIdx].netto!) }
        : null,
  };
}

/**
 * Start/nå/beste for brutto + netto over vinduet (#949). Ren, I/O-fri.
 * `start` = første runde, `now` = siste, `best` = laveste. Netto-felt er `null`
 * når ingen runde i vinduet har netto (alle `best`/`start`/`now` følger med).
 * Kallstedet garanterer minst én runde (geometrien er allerede `null`-gatet).
 */
export function summarizeTrendRounds(rounds: TrendRound[]): TrendSummary {
  const first = rounds[0];
  const last = rounds[rounds.length - 1];

  const nettos = rounds
    .map((r) => r.netto)
    .filter((v): v is number => v != null);
  const bestNetto = nettos.length > 0 ? Math.min(...nettos) : null;

  return {
    brutto: {
      start: first.brutto,
      now: last.brutto,
      best: Math.min(...rounds.map((r) => r.brutto)),
    },
    netto: {
      start: first.netto,
      now: last.netto,
      best: bestNetto,
    },
  };
}

/** Rundene formsetningen sammenligner: de fem siste mot de fem før (#2265). */
const FORM_WINDOW = 5;

/**
 * Formsetningen i appen (#2265): snittet av de fem rundene før minus snittet
 * av de fem siste, med én desimal. Positivt = de siste er bedre (lavere).
 * `null` under ti runder. `bruttos` er eldst→nyest.
 */
export function compareRecentForm(
  bruttos: readonly number[],
  size = FORM_WINDOW,
): number | null {
  if (bruttos.length < size * 2) return null;
  const mean = (values: readonly number[]) =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  const last = bruttos.slice(-size);
  const before = bruttos.slice(-size * 2, -size);
  // Avrundes på tideler i heltall, så 3,8 ikke blir 3,7999… .
  return Math.round((mean(before) - mean(last)) * 10) / 10;
}

/**
 * «Ny rekord» (#2265): den nyeste runden er STRENGT lavere enn alle før. Lik
 * den gamle rekorden er ingen ny rekord. `bruttos` er eldst→nyest og skal være
 * alle hele runder, ikke bare vinduet kurven viser.
 */
export function isNewRecord(bruttos: readonly number[]): boolean {
  if (bruttos.length < 2) return false;
  const newest = bruttos[bruttos.length - 1];
  return bruttos.slice(0, -1).every((v) => newest < v);
}
