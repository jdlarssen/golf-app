'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';

export interface HoleStripProps {
  gameId: string;
  currentHole: number;
}

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

const containerStyle: CSSProperties = {
  padding: '6px 14px 8px',
  overflowX: 'auto',
  whiteSpace: 'nowrap',
};

const innerStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 4,
};

const hitAreaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  textDecoration: 'none',
};

function cellStyle(state: 'current' | 'completed' | 'future'): CSSProperties {
  const base: CSSProperties = {
    width: 26,
    height: 32,
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-serif)',
    fontSize: 13,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  };
  if (state === 'current') {
    return {
      ...base,
      background: 'var(--primary)',
      color: '#F0EDE5',
      fontWeight: 600,
      border: 'none',
    };
  }
  if (state === 'completed') {
    return {
      ...base,
      background: '#EFE9DA',
      color: 'var(--text)',
      fontWeight: 500,
      border: '1px solid var(--border)',
    };
  }
  return {
    ...base,
    background: 'transparent',
    color: 'var(--text-muted)',
    fontWeight: 500,
    border: 'none',
  };
}

export function HoleStrip(props: HoleStripProps): JSX.Element {
  const { gameId, currentHole } = props;
  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {HOLES.map((n) => {
          const state =
            n === currentHole
              ? 'current'
              : n < currentHole
                ? 'completed'
                : 'future';
          return (
            <SmartLink
              key={n}
              href={`/games/${gameId}/holes/${n}`}
              style={hitAreaStyle}
              aria-label={`Hull ${n}`}
              aria-current={state === 'current' ? 'page' : undefined}
            >
              <span style={cellStyle(state)}>{n}</span>
            </SmartLink>
          );
        })}
      </div>
    </div>
  );
}
