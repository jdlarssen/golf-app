import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ScoreShape as ShapeKind } from '@/lib/scoring/scoreShape';
import type { ScoreTone } from '@/lib/scoring/scoreTone';

export type ScoreShapeSize = 'sm' | 'md' | 'lg';

export interface ScoreShapeProps {
  shape: ShapeKind;
  tone: ScoreTone;
  size?: ScoreShapeSize;
  children: ReactNode;
}

const SIZE_PX: Record<ScoreShapeSize, number> = {
  sm: 28,
  md: 36,
  lg: 52,
};

const STROKE_BY_SIZE: Record<ScoreShapeSize, number> = {
  sm: 1.25,
  md: 1.5,
  lg: 2,
};

// Stroke colors mirror the existing scoreTone palette used elsewhere.
const STROKE_COLOR: Record<ScoreTone, string> = {
  unset: '#9A8F7C',
  under: '#2F5A3C',
  par: '#5C5347',
  over1: '#7A5410',
  over2: '#7A2F2A',
};

export function ScoreShape(props: ScoreShapeProps): JSX.Element {
  const { shape, tone, size = 'lg', children } = props;
  if (shape === 'none') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </span>
    );
  }

  const px = SIZE_PX[size];
  const stroke = STROKE_BY_SIZE[size];
  const color = STROKE_COLOR[tone];
  const half = px / 2;
  const inner = half - stroke;
  const innerSquareOffset = stroke / 2;
  const gap = Math.max(3, stroke + 1);

  const wrapStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    width: px,
    height: px,
  };

  const svgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  };

  // Use lineHeight matching the shape height to vertically center digits.
  // The previous flex-based centering left the Fraunces glyph slightly low
  // because the digit's ascender space pushed the visual centroid above the
  // bounding-box center. Setting lineHeight = px lets the digit baseline fall
  // naturally at the box center.
  const numberStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'block',
    width: px,
    height: px,
    lineHeight: `${px}px`,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  };

  // Concentric circle radii — level 0 is outermost, gap shrinks each ring.
  const circleLevels =
    shape === 'circle' ? 1 : shape === 'double-circle' ? 2 : shape === 'triple-circle' ? 3 : 0;

  // Nested square offsets — level 0 is outermost, gap grows each step in.
  const squareLevels =
    shape === 'square'
      ? 1
      : shape === 'double-square'
        ? 2
        : shape === 'triple-square'
          ? 3
          : shape === 'quadruple-square'
            ? 4
            : 0;

  return (
    <span style={wrapStyle}>
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        style={svgStyle}
        aria-hidden
      >
        {Array.from({ length: circleLevels }).map((_, i) => (
          <circle
            key={`c-${i}`}
            cx={half}
            cy={half}
            r={inner - i * gap}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
        ))}
        {Array.from({ length: squareLevels }).map((_, i) => (
          <rect
            key={`r-${i}`}
            x={innerSquareOffset + i * gap}
            y={innerSquareOffset + i * gap}
            width={px - stroke - 2 * i * gap}
            height={px - stroke - 2 * i * gap}
            rx={Math.max(2, 4 - i)}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
        ))}
      </svg>
      <span style={numberStyle}>{children}</span>
    </span>
  );
}
