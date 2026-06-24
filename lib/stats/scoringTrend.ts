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
 */

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
  /** Padded y-domene som faktisk ble brukt (verst..best i score-tall). */
  yMin: number;
  yMax: number;
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
  // (spenn 0) får et fast vindu så den havner midt i grafen.
  const span = rawMax - rawMin;
  const pad = span === 0 ? 2 : Math.max(1, Math.round(span * 0.1));
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const domain = yMax - yMin; // alltid > 0 etter padding

  const n = rounds.length;
  const mapX = (i: number): number =>
    padding.left + (i / (n - 1)) * innerWidth;
  // Høyere score (større v) → mindre svg-y → høyere på skjermen.
  const mapY = (v: number): number =>
    padding.top + ((yMax - v) / domain) * innerHeight;

  const bruttoPoints: TrendPoint[] = rounds.map((r, i) => ({
    x: mapX(i),
    y: mapY(r.brutto),
  }));

  const nettoPoints: TrendPoint[] = [];
  rounds.forEach((r, i) => {
    if (r.netto != null) nettoPoints.push({ x: mapX(i), y: mapY(r.netto) });
  });

  return {
    width,
    height,
    bruttoPoints,
    nettoPoints,
    bruttoPolyline: toPolyline(bruttoPoints),
    nettoPolyline: toPolyline(nettoPoints),
    yMin,
    yMax,
  };
}
