import type { CSSProperties, JSX } from 'react';

export interface HoleHeroProps {
  holeNumber: number;
  par: number;
  strokeIndex: number;
}

const containerStyle: CSSProperties = {
  padding: '10px 24px 12px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const leftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
};

const numberStyle: CSSProperties = {
  fontSize: 44,
  letterSpacing: '-0.03em',
  lineHeight: 1,
  color: 'var(--text)',
};

const rightStyle: CSSProperties = {
  textAlign: 'right',
  lineHeight: 1.4,
};

const parStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 20,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
};

const indexStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

export function HoleHero(props: HoleHeroProps): JSX.Element {
  const { holeNumber, par, strokeIndex } = props;
  return (
    <div style={containerStyle}>
      <div style={leftStyle}>
        <div style={kickerStyle}>HULL</div>
        <div className="score-num" style={numberStyle}>{holeNumber}</div>
      </div>
      <div style={rightStyle}>
        <div style={parStyle}>Par {par}</div>
        <div style={indexStyle}>indeks {strokeIndex}</div>
      </div>
    </div>
  );
}
