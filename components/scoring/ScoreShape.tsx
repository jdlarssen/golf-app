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
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: px,
    height: px,
  };

  const svgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  };

  const numberStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <span style={wrapStyle}>
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        style={svgStyle}
        aria-hidden
      >
        {shape === 'circle' && (
          <circle
            cx={half}
            cy={half}
            r={inner}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
        )}
        {shape === 'double-circle' && (
          <>
            <circle
              cx={half}
              cy={half}
              r={inner}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
            <circle
              cx={half}
              cy={half}
              r={inner - gap}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
          </>
        )}
        {shape === 'square' && (
          <rect
            x={innerSquareOffset}
            y={innerSquareOffset}
            width={px - stroke}
            height={px - stroke}
            rx={4}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
          />
        )}
        {shape === 'double-square' && (
          <>
            <rect
              x={innerSquareOffset}
              y={innerSquareOffset}
              width={px - stroke}
              height={px - stroke}
              rx={4}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
            <rect
              x={innerSquareOffset + gap}
              y={innerSquareOffset + gap}
              width={px - stroke - 2 * gap}
              height={px - stroke - 2 * gap}
              rx={3}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
            />
          </>
        )}
      </svg>
      <span style={numberStyle}>{children}</span>
    </span>
  );
}
