'use client';

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { scoreShape, type ScoreShape as ScoreShapeKind } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';

/** One player in the demo flight, with the numbers worked out by the caller. */
export interface DemoFlightRowData {
  playerId: string;
  name: string;
  extraStrokes: number;
  score: number | null;
  points: number | null;
}

export interface DemoFlightListProps {
  par: number;
  you: DemoFlightRowData;
  opponents: DemoFlightRowData[];
  /** The rail is entering your score now. */
  youActive: boolean;
  onSelectYou: () => void;
}

const cardStyle: CSSProperties = {
  margin: '12px 16px 0 16px',
  borderRadius: 16,
  overflow: 'hidden',
  lineHeight: 'normal',
};

const rowStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  textAlign: 'left',
  font: 'inherit',
};

const avatarStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
};

const nameStyle: CSSProperties = {
  display: 'block',
  fontSize: 15,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const badgeStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--accent-text)',
};

const pointsStyle: CSSProperties = {
  width: 36,
  flexShrink: 0,
  textAlign: 'right',
  fontSize: 13,
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

// Nested shapes eat into the 30 px box; two digits need more room still.
function digitSize(shape: ScoreShapeKind, n: number): number {
  const nested = shape === 'triple-circle' || shape === 'triple-square' || shape === 'quadruple-square';
  if (n >= 10) return nested ? 10 : 13;
  return nested ? 13 : 16;
}

function Score({ score, par }: { score: number; par: number }): JSX.Element {
  const shape = scoreShape(score, par);
  return (
    <ScoreShape shape={shape} tone={scoreTone(score, par)} size="row">
      <span
        data-testid="score-number"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: digitSize(shape, score),
          fontWeight: 600,
          color: 'var(--text)',
        }}
      >
        {score}
      </span>
    </ScoreShape>
  );
}

/**
 * The flight on the demo's hole (#2281): your row, which hands you the rail,
 * and the two opponents who have already entered theirs. The opponents' rows
 * are plain text, not buttons — the demo never enters scores for them.
 */
export function DemoFlightList(props: DemoFlightListProps): JSX.Element {
  const t = useTranslations('holes');
  const { par, you, opponents, youActive, onSelectYou } = props;

  return (
    // data-focus-inset: the card clips, so the row's focus ring goes inside.
    <div data-focus-inset className="border border-border bg-surface" style={cardStyle}>
      <button
        type="button"
        data-testid="flight-row"
        data-player-id={you.playerId}
        data-active={youActive ? 'true' : 'false'}
        aria-pressed={youActive}
        aria-label={
          you.score == null
            ? t('scoreRail.rowAriaLabelEmpty', { name: you.name })
            : t('scoreRail.rowAriaLabelScored', { name: you.name, score: you.score })
        }
        onClick={onSelectYou}
        className={youActive ? 'bg-primary-soft text-text' : 'bg-transparent text-text'}
        style={{
          ...rowStyle,
          border: 'none',
          minHeight: 44,
          cursor: 'pointer',
          boxShadow: youActive ? 'inset 4px 0 0 var(--primary)' : 'none',
        }}
      >
        <span
          aria-hidden="true"
          className="bg-primary text-bg-tint dark:text-bg"
          style={avatarStyle}
        >
          {you.name.charAt(0)}
        </span>
        <span style={{ flexGrow: 1, minWidth: 0 }}>
          <span style={nameStyle}>{you.name}</span>
          {you.extraStrokes > 0 && (
            <span data-testid="flight-row-strokes" style={badgeStyle}>
              {t('scoreCard.strokesBadge', { n: you.extraStrokes })}
            </span>
          )}
        </span>
        {you.score == null ? (
          <span
            data-testid="score-number"
            style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--score-unset-fg)' }}
          >
            —
          </span>
        ) : (
          <>
            <Score score={you.score} par={par} />
            <span style={pointsStyle}>
              {you.points != null ? t('scoreRail.rowPoints', { points: you.points }) : null}
            </span>
          </>
        )}
      </button>

      {opponents.map((row) => (
        <div
          key={row.playerId}
          data-testid="demo-opponent-row"
          data-player-id={row.playerId}
          style={{ ...rowStyle, borderTop: '1px solid var(--row-divider-warm)' }}
        >
          <span
            aria-hidden="true"
            className="bg-hole-completed-bg text-muted"
            style={avatarStyle}
          >
            {row.name.charAt(0)}
          </span>
          <span style={{ ...nameStyle, flexGrow: 1, minWidth: 0 }}>{row.name}</span>
          {row.score != null && <Score score={row.score} par={par} />}
          <span style={pointsStyle}>
            {row.points != null ? t('scoreRail.rowPoints', { points: row.points }) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
