import type { JSX } from 'react';
import type {
  ScoringTrendGeometry,
  TrendSummary,
} from '@/lib/stats/scoringTrend';

export interface ScoringTrendChartProps {
  geometry: ScoringTrendGeometry;
  summary: TrendSummary;
  /** Norsk sammendrag for skjermlesere. */
  ariaLabel: string;
  /** Kort-tittel, f.eks. «Formkurven din». */
  heading: string;
  /** «Siste 20 runder» (antall-bevisst). */
  windowLabel: string;
  /** Dato-spenn, f.eks. «5. jan – 24. jun». */
  dateRangeLabel: string;
  bruttoLabel: string;
  nettoLabel: string;
  startLabel: string;
  nowLabel: string;
  bestLabel: string;
}

const STROKE_WIDTH = 2.5;
const POINT_RADIUS = 3;
const RECORD_RING_RADIUS = 5.5;
const NETTO_DASH = '5 4';

/** Score → vist tekst; manglende netto blir en tankestrek. */
function fmt(value: number | null): string {
  return value == null ? '–' : String(value);
}

/**
 * Personlig formkurve (#936, ankret i #949): brutto + netto over de siste
 * rundene, med Start/Nå/Beste i bokser og rekordene markert i champagne-gull.
 *
 * Ren, synkron presentasjon — geometri + sammendrag kommer ferdig fra
 * `lib/stats/scoringTrend.ts`. Statisk (ingen animasjon, så
 * `prefers-reduced-motion` er et ikke-tema).
 *
 * **Kobling boks ↔ linje:** boks-rammen følger linjestilen (brutto heltrukken
 * `--color-primary`, netto stiplet `--color-muted`), så vi slipper en egen
 * tegnforklaring. **Rekord:** «Beste»-boksen får en svak gull-tint og punktet
 * på kurven en gull-ring. Gullet bærer ALDRI tekst (stryker WCAG AA på lys bg,
 * jf. `/profile/statistikk`) — tallet står i `--color-text`, og «Beste»-merket
 * er ikke eneste bærer av rekord-info (boksen er også tekstmerket).
 */
export function ScoringTrendChart({
  geometry,
  summary,
  ariaLabel,
  heading,
  windowLabel,
  dateRangeLabel,
  bruttoLabel,
  nettoLabel,
  startLabel,
  nowLabel,
  bestLabel,
}: ScoringTrendChartProps): JSX.Element {
  const { width, height, bruttoPoints, nettoPoints } = geometry;
  const hasNetto = nettoPoints.length > 0;

  return (
    <figure data-testid="scoring-trend" className="m-0">
      {/* Header: tittel venstre, vindu + dato-spenn høyre. */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="font-serif text-lg font-medium leading-tight text-text">
          {heading}
        </h2>
        <div className="whitespace-nowrap text-right font-sans text-[12px] leading-snug text-muted">
          <div>{windowLabel}</div>
          <div>{dateRangeLabel}</div>
        </div>
      </div>

      <BoxRow
        label={bruttoLabel}
        variant="brutto"
        stats={[
          { label: startLabel, value: summary.brutto.start },
          { label: nowLabel, value: summary.brutto.now },
          { label: bestLabel, value: summary.brutto.best, best: true },
        ]}
      />

      {hasNetto && (
        <BoxRow
          className="mt-2"
          label={nettoLabel}
          variant="netto"
          stats={[
            { label: startLabel, value: summary.netto.start },
            { label: nowLabel, value: summary.netto.now },
            { label: bestLabel, value: summary.netto.best, best: true },
          ]}
        />
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 w-full h-auto"
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

        {/* Rekord-ringer i gull — beste brutto og beste netto. */}
        <RecordMarker point={geometry.bruttoBestPoint} />
        {hasNetto && geometry.nettoBestPoint && (
          <RecordMarker point={geometry.nettoBestPoint} />
        )}
      </svg>
    </figure>
  );
}

function RecordMarker({ point }: { point: { x: number; y: number } }): JSX.Element {
  return (
    <g data-testid="trend-record">
      <circle
        cx={point.x}
        cy={point.y}
        r={RECORD_RING_RADIUS}
        fill="none"
        stroke="var(--color-accent-deep)"
        strokeWidth={2.2}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={point.x} cy={point.y} r={POINT_RADIUS} fill="var(--color-accent)" />
    </g>
  );
}

type BoxStat = { label: string; value: number | null; best?: boolean };

function BoxRow({
  label,
  variant,
  stats,
  className,
}: {
  label: string;
  variant: 'brutto' | 'netto';
  stats: BoxStat[];
  className?: string;
}): JSX.Element {
  const labelColor =
    variant === 'brutto' ? 'text-[color:var(--color-primary)]' : 'text-muted';
  return (
    <div className={`flex items-stretch gap-2 ${className ?? ''}`}>
      <span
        className={`flex w-4 shrink-0 items-center justify-center font-sans text-[11px] font-medium tracking-wide ${labelColor}`}
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
      >
        {label}
      </span>
      <div className="grid flex-1 grid-cols-3 gap-2">
        {stats.map((s) => (
          <StatBox key={s.label} variant={variant} {...s} />
        ))}
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  variant,
  best,
}: BoxStat & { variant: 'brutto' | 'netto' }): JSX.Element {
  // Rammen følger linjestilen — erstatter egen tegnforklaring.
  const border =
    variant === 'brutto'
      ? 'border-[1.5px] border-primary'
      : 'border-[1.5px] border-dashed border-muted';
  return (
    <div className={`rounded-lg px-2 py-2 text-center ${border} ${best ? 'bg-accent/10' : ''}`}>
      <div className="font-sans text-[11px] text-muted">{label}</div>
      <div className="font-serif text-2xl font-medium leading-tight tabular-nums text-text">
        {fmt(value)}
      </div>
    </div>
  );
}
