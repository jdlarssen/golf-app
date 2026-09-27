'use client';

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';
import { scoreTone } from '@/lib/scoring/scoreTone';
import { scoreShape, type ScoreShape as ScoreShapeKind } from '@/lib/scoring/scoreShape';
import { ScoreShape } from '@/components/scoring/ScoreShape';

export interface FlightRowProps {
  playerId: string;
  name: string;
  initial: string | null;
  extraStrokes: number;
  score: number | null;
  par: number;
  /** The rail is entering this row now. */
  active: boolean;
  /** #2211: submitted, withdrawn or the page is locked — read-only row. */
  locked: boolean;
  submitted?: boolean;
  /**
   * Stableford points for the entered score. Null hides them: not a
   * stableford format, no score yet, or a reveal game (#1447).
   */
  points: number | null;
  onSelect: (playerId: string) => void;
}

// Nested shapes eat into the 36px md box; two digits need more headroom.
function numberFontSize(shape: ScoreShapeKind, n: number): number {
  const twoDigit = n >= 10;
  if (shape === 'quadruple-square') return twoDigit ? 9 : 11;
  if (shape === 'triple-circle' || shape === 'triple-square') return twoDigit ? 11 : 13;
  if (shape === 'double-circle' || shape === 'double-square') return twoDigit ? 13 : 16;
  return twoDigit ? 16 : 20;
}

function numberColor(score: number | null, par: number): string {
  switch (scoreTone(score, par)) {
    case 'under':
      return 'var(--score-under-fg)';
    case 'over2':
      return 'var(--score-over2-fg)';
    case 'unset':
      return 'var(--text-muted)';
    default:
      return 'var(--text)';
  }
}

const avatarBase: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: 'var(--surface-strong)',
  color: 'var(--bg-tint)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-serif)',
  fontWeight: 500,
  flexShrink: 0,
};

const nameStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 16,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const badgeStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.16em',
  color: 'var(--primary)',
  whiteSpace: 'nowrap',
};

const pointsStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};

/**
 * One player (or team) in the flight on the rail hole page (#2251). The whole
 * row is one button: tapping it hands the rail to this player so their score
 * can be corrected. No nested controls, so the button semantics stay intact.
 */
export function FlightRow(props: FlightRowProps): JSX.Element {
  const t = useTranslations('holes');
  const {
    playerId,
    name,
    initial,
    extraStrokes,
    score,
    par,
    active,
    locked,
    submitted = false,
    points,
    onSelect,
  } = props;

  const shape = scoreShape(score, par);
  const initialChars = initial && initial.length > 0 ? initial : '?';

  const rowStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    padding: '8px 12px 8px 14px',
    border: 'var(--hole-border-w, 1px) solid',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    borderRadius: 14,
    background: active ? 'var(--primary-soft)' : 'var(--surface)',
    boxShadow: active ? 'inset var(--active-bar-w, 4px) 0 0 var(--primary)' : 'none',
    color: 'var(--text)',
    textAlign: 'left',
    font: 'inherit',
    cursor: locked ? 'not-allowed' : 'pointer',
    opacity: locked ? 0.6 : 1,
  };

  return (
    <button
      type="button"
      data-testid="flight-row"
      data-player-id={playerId}
      data-extra-strokes={extraStrokes}
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
      aria-label={
        score == null
          ? t('scoreRail.rowAriaLabelEmpty', { name })
          : t('scoreRail.rowAriaLabelScored', { name, score })
      }
      disabled={locked}
      onClick={() => onSelect(playerId)}
      className="motion-safe:transition-colors motion-safe:duration-150"
      style={rowStyle}
    >
      <span
        aria-hidden="true"
        style={{ ...avatarBase, fontSize: initialChars.length > 1 ? 12 : 14 }}
      >
        {initialChars}
      </span>

      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <span style={nameStyle}>{name}</span>
        {/* #1447: the stroke badge is the handicap allocation, not standing —
            it stays on in a reveal game too. */}
        {extraStrokes > 0 && (
          <span data-testid="flight-row-strokes" style={badgeStyle}>
            {t('scoreCard.strokesBadge', { n: extraStrokes })}
          </span>
        )}
        {submitted && (
          <span data-testid="flight-row-submitted" style={{ ...badgeStyle, color: 'var(--text-muted)' }}>
            {t('scoreCard.submittedBadge')}
          </span>
        )}
      </span>

      {points != null && (
        <span data-testid="flight-row-points" style={pointsStyle}>
          {t('scoreRail.rowPoints', { points })}
        </span>
      )}

      <ScoreShape shape={shape} tone={scoreTone(score, par)} size="md">
        <span
          data-testid="score-number"
          className="score-num"
          style={{
            fontSize: numberFontSize(shape, score ?? 0),
            color: numberColor(score, par),
            letterSpacing: '-0.02em',
          }}
        >
          {score ?? '—'}
        </span>
      </ScoreShape>
    </button>
  );
}
