import type { JSX } from 'react';
import type { ScoringTrendGeometry } from '@/lib/stats/scoringTrend';

export interface ScoringTrendChartProps {
  geometry: ScoringTrendGeometry;
  /** Norsk sammendrag for skjermlesere, f.eks. «Scoringstrend over 8 runder». */
  ariaLabel: string;
  bruttoLabel: string;
  nettoLabel: string;
}

const STROKE_WIDTH = 2.5;
const POINT_RADIUS = 3;
const NETTO_DASH = '5 4';

/**
 * Personlig scoringstrend (#936): to håndrullede SVG-linjer over brutto + netto
 * per komplett 18-hulls-runde. Ren, synkron presentasjon — geometrien kommer
 * ferdig fra `buildScoringTrend`, kallstedet eier dataene.
 *
 * Statisk (ingen animasjon — unngår hele prefers-reduced-motion-klassen).
 * Brutto er heltrukken (`--color-primary`), netto er stiplet (`--color-muted`):
 * formen skiller linjene, ikke bare fargen, så det er fargeblind-trygt. Selve
 * tallene leses i runde-lista under; grafen svarer kun på «opp eller ned?».
 */
export function ScoringTrendChart({
  geometry,
  ariaLabel,
  bruttoLabel,
  nettoLabel,
}: ScoringTrendChartProps): JSX.Element {
  const { width, height, bruttoPoints, nettoPoints } = geometry;
  const hasNetto = nettoPoints.length > 0;

  return (
    <figure data-testid="scoring-trend" className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {/* Netto først, så brutto (primær) tegnes oppå. */}
        {hasNetto && nettoPoints.length >= 2 && (
          <polyline
            points={geometry.nettoPolyline}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={NETTO_DASH}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={geometry.bruttoPolyline}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hasNetto &&
          nettoPoints.map((p, i) => (
            <circle
              key={`n-${i}`}
              cx={p.x}
              cy={p.y}
              r={POINT_RADIUS}
              fill="var(--color-muted)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {bruttoPoints.map((p, i) => (
          <circle
            key={`b-${i}`}
            cx={p.x}
            cy={p.y}
            r={POINT_RADIUS}
            fill="var(--color-primary)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Legende i HTML — markerbar, tilgjengelig tekst (ikke bare farge i SVG). */}
      <figcaption className="mt-3 flex items-center gap-4 font-sans text-[13px] text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-[3px] w-5 rounded-full"
            style={{ backgroundColor: 'var(--color-primary)' }}
          />
          {bruttoLabel}
        </span>
        {hasNetto && (
          <span className="inline-flex items-center gap-2">
            {/* Stiplet swatch matcher netto-linja. */}
            <svg
              aria-hidden="true"
              width="20"
              height="3"
              viewBox="0 0 20 3"
              className="overflow-visible"
            >
              <line
                x1="0"
                y1="1.5"
                x2="20"
                y2="1.5"
                stroke="var(--color-muted)"
                strokeWidth="2"
                strokeDasharray={NETTO_DASH}
                strokeLinecap="round"
              />
            </svg>
            {nettoLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
