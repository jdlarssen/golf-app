'use client';

import { useId, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import type { StrokeTerm } from '@/lib/scorecard/scoreRail';
import { PuttsChips } from './PuttsChips';

/**
 * What each rail button shows after the term: stableford points, net
 * strokes, or nothing (a reveal game keeps net and points hidden, #1447).
 */
export type RailDisplay = 'points' | 'netto' | 'plain';

/** One number on the rail, with its result computed by the caller. */
export interface RailOption {
  strokes: number;
  term: StrokeTerm;
  points: number | null;
  netto: number;
}

/** The seat the rail is entering. */
export interface RailActiveSeat {
  playerId: string;
  name: string;
  extraStrokes: number;
  score: number | null;
  putts: number | null;
}

export interface ScoreRailProps {
  /** Null once everyone has a score: the rail shrinks to one line. */
  active: RailActiveSeat | null;
  par: number;
  options: RailOption[];
  display: RailDisplay;
  puttsTracking: boolean;
  /** Name for «Neste: X →», or null when no other seat is missing a score. */
  skipTo: string | null;
  onPick: (strokes: number) => void;
  onOther: () => void;
  onStep: (delta: 1 | -1) => void;
  onUndo: () => void;
  onSkip: () => void;
  onPutts: (putts: number) => void;
}

const sectionStyle: CSSProperties = {
  padding: '10px 14px 8px',
  borderTop: 'var(--hole-border-w, 1px) solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minHeight: 44,
};

const headingStyle: CSSProperties = {
  margin: 0,
  flex: 1,
  minWidth: 0,
  fontFamily: 'var(--font-serif)',
  fontSize: 17,
  fontWeight: 500,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const linkButtonStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--primary)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
};

const optionStyle: CSSProperties = {
  height: 'var(--score-button-size, 64px)',
  border: 'var(--hole-border-w, 1px) solid var(--border)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  padding: '0 4px',
  cursor: 'pointer',
  font: 'inherit',
};

const optionNumberStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 24,
  fontWeight: 600,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
};

const optionDetailStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1.2,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

const correctRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const stepButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: 'var(--hole-border-w, 1px) solid var(--border)',
  borderRadius: 11,
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 18,
  fontWeight: 600,
  cursor: 'pointer',
};

const undoButtonStyle: CSSProperties = {
  ...linkButtonStyle,
  marginLeft: 'auto',
  color: 'var(--text-muted)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
};

const puttsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const puttsLabelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
};

const allScoredStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  lineHeight: 1.4,
  color: 'var(--text-muted)',
  textAlign: 'center',
};

/**
 * The score rail in the thumb zone of the hole page (#2251). Five numbers
 * (par −1 … par +3) plus «Annet», each showing its result before the tap.
 * Purely presentational: `useScoreRail` owns which seat is active and what a
 * tap writes.
 */
export function ScoreRail(props: ScoreRailProps): JSX.Element {
  const t = useTranslations('holes');
  const headingId = useId();
  const {
    active,
    par,
    options,
    display,
    puttsTracking,
    skipTo,
    onPick,
    onOther,
    onStep,
    onUndo,
    onSkip,
    onPutts,
  } = props;

  function termText(option: RailOption): string {
    return t(`scoreRail.term.${option.term}`, { n: option.strokes - par });
  }

  function detailText(option: RailOption): string {
    const term = termText(option);
    if (display === 'points' && option.points != null) {
      return t('scoreRail.detailPoints', { term, points: option.points });
    }
    if (display === 'netto') {
      return t('scoreRail.detailNetto', { term, netto: option.netto });
    }
    return term;
  }

  function ariaText(option: RailOption, name: string): string {
    const base = { strokes: option.strokes, name, term: termText(option) };
    if (display === 'points' && option.points != null) {
      return t('scoreRail.buttonAriaLabelPoints', { ...base, points: option.points });
    }
    if (display === 'netto') {
      return t('scoreRail.buttonAriaLabelNetto', { ...base, netto: option.netto });
    }
    return t('scoreRail.buttonAriaLabel', base);
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="score-rail"
      data-state={active ? 'entering' : 'done'}
      style={sectionStyle}
    >
      {active ? (
        <>
          <div style={headerStyle}>
            <h2 id={headingId} data-testid="score-rail-heading" style={headingStyle}>
              {active.extraStrokes > 0
                ? t('scoreRail.headingWithStrokes', {
                    name: active.name,
                    n: active.extraStrokes,
                  })
                : active.name}
            </h2>
            {skipTo != null && (
              <button
                type="button"
                data-testid="score-rail-skip"
                aria-label={t('scoreRail.skipAriaLabel', { name: skipTo })}
                onClick={onSkip}
                style={linkButtonStyle}
              >
                {t('scoreRail.skip', { name: skipTo })}
              </button>
            )}
          </div>

          <div style={gridStyle}>
            {options.map((option) => {
              const selected = active.score === option.strokes;
              return (
                <button
                  key={option.strokes}
                  type="button"
                  data-testid="rail-option"
                  data-strokes={option.strokes}
                  data-points={display === 'points' ? (option.points ?? undefined) : undefined}
                  data-netto={display === 'netto' ? option.netto : undefined}
                  aria-pressed={selected}
                  aria-label={ariaText(option, active.name)}
                  onClick={() => onPick(option.strokes)}
                  className={[
                    'motion-safe:transition-colors motion-safe:duration-150',
                    selected ? 'bg-primary text-bg-tint dark:text-bg' : 'bg-surface text-text',
                  ].join(' ')}
                  style={{
                    ...optionStyle,
                    borderColor: selected ? 'var(--primary)' : 'var(--border)',
                  }}
                >
                  <span style={optionNumberStyle}>{option.strokes}</span>
                  <span
                    style={optionDetailStyle}
                    className={selected ? undefined : 'text-muted'}
                  >
                    {detailText(option)}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              data-testid="rail-other"
              aria-label={t('scoreRail.otherAriaLabel', { name: active.name })}
              onClick={onOther}
              className="bg-surface text-text motion-safe:transition-colors motion-safe:duration-150"
              style={optionStyle}
            >
              <span style={{ ...optionNumberStyle, fontFamily: 'var(--font-sans)', fontSize: 15 }}>
                {t('scoreRail.other')}
              </span>
            </button>
          </div>

          {active.score != null && (
            <div style={correctRowStyle}>
              <button
                type="button"
                aria-label={t('scoreCard.decreaseAriaLabel', { name: active.name })}
                onClick={() => onStep(-1)}
                style={stepButtonStyle}
              >
                −
              </button>
              <button
                type="button"
                aria-label={t('scoreCard.increaseAriaLabel', { name: active.name })}
                onClick={() => onStep(1)}
                style={stepButtonStyle}
              >
                +
              </button>
              <button
                type="button"
                aria-label={t('scoreCard.undoScoreAriaLabel', { name: active.name })}
                onClick={onUndo}
                style={undoButtonStyle}
              >
                {t('scoreCard.undoScore')}
              </button>
            </div>
          )}

          {puttsTracking && (
            <div style={puttsRowStyle}>
              <span style={puttsLabelStyle} aria-hidden="true">
                {t('putts.fieldLabel')}
              </span>
              {/* key: the «5+» stepper state must not follow the rail to the
                  next player. */}
              <PuttsChips
                key={active.playerId}
                value={active.putts}
                ariaName={active.name}
                onSelect={onPutts}
              />
            </div>
          )}
        </>
      ) : (
        <p id={headingId} data-testid="score-rail-all-scored" aria-hidden="true" style={allScoredStyle}>
          {t('scoreRail.allScored')}
        </p>
      )}

      {/* One live region for both states, so a screen reader hears where the
          rail went after each tap. */}
      <p className="sr-only" aria-live="polite" data-testid="score-rail-announcement">
        {active
          ? t('scoreRail.nextAnnouncement', { name: active.name })
          : t('scoreRail.allScored')}
      </p>
    </section>
  );
}
