'use client';

import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { buttonClasses } from '@/components/ui/Button';
import { railStrokes, strokeTerm } from '@/lib/scorecard/scoreRail';
import { stablefordPointsForCard } from '@/lib/scorecard/railPoints';

export interface DemoRailProps {
  name: string;
  extraStrokes: number;
  par: number;
  score: number | null;
  /** The grid is open: the hole has no score yet, or you tapped your row. */
  entering: boolean;
  isLastHole: boolean;
  onPick: (strokes: number) => void;
  onOther: () => void;
  onStep: (delta: 1 | -1) => void;
  onUndo: () => void;
  /** «Neste hull», or «Se tavla» on the last hole. */
  onNext: () => void;
}

/** Login, then back to Home: where both of the demo's ways out lead. */
export const DEMO_EXIT_HREF = '/login?next=%2F';

// Fixed to the viewport like the hole page's rail. No z-index of 10 or more:
// «Annet»'s sheet (SpecificValueSheet, z-index 10) must open over it. 5 keeps
// it above the page's own positioned bits (ScoreShape's digit sits at 1).
const panelStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 5,
  borderRadius: '20px 20px 0 0',
  boxShadow: '0 -8px 24px rgba(26,46,31,0.08)',
  padding: '12px 16px calc(20px + env(safe-area-inset-bottom, 0px)) 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  lineHeight: 'normal',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
};

const optionStyle: CSSProperties = {
  height: 64,
  borderRadius: 14,
  borderStyle: 'solid',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  padding: '0 4px',
  font: 'inherit',
  lineHeight: 'normal',
  cursor: 'pointer',
};

const numberStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 22,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const detailStyle: CSSProperties = {
  fontSize: 11,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: '100%',
};

const stepButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  border: '1px solid var(--border)',
  borderRadius: 11,
  fontSize: 18,
  fontWeight: 600,
  cursor: 'pointer',
};

const undoStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  marginLeft: 'auto',
  padding: '0 4px',
  border: 'none',
  background: 'transparent',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  cursor: 'pointer',
};

const skipStyle: CSSProperties = {
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--primary)',
  textDecoration: 'underline',
};

/**
 * The demo's score rail (#2281), drawn as its artboard: five numbers with the
 * result before the tap, «Annet», and the way out. After a tap it shrinks to
 * «Neste hull». Its own component rather than the hole page's ScoreRail,
 * which looks different (#2281 contract, O2); the numbers come from the same
 * rules (`railStrokes`, `strokeTerm`, `stablefordPointsForCard`).
 *
 * The panel is fixed to the screen's bottom edge, so a spacer in the page
 * keeps the bubble and the last row clear of it.
 */
export function DemoRail(props: DemoRailProps): JSX.Element {
  const t = useTranslations('demo');
  const th = useTranslations('holes');
  const { name, extraStrokes, par, score, entering, isLastHole, onPick, onOther, onStep, onUndo, onNext } =
    props;

  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setPanelHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const heading =
    extraStrokes > 0 ? th('scoreRail.headingWithStrokes', { name, n: extraStrokes }) : name;

  function termText(strokes: number): string {
    const term = strokeTerm(strokes, par);
    // The demo says «Dobbel»/«Trippel» as its artboard does (#2281, O7).
    if (term === 'doubleBogey' || term === 'tripleBogey') return t(`term.${term}`);
    return th(`scoreRail.term.${term}`, { n: strokes - par });
  }

  function pointsFor(strokes: number): number {
    return (
      stablefordPointsForCard({
        card: { score: strokes, extraStrokes },
        par,
        gameMode: 'stableford',
        isStableford: true,
      }) ?? 0
    );
  }

  return (
    <>
      {/* The page's air above the panel: its height plus 12 px, less the
          bottom padding AppShell already gives (5rem + the safe area). */}
      <div
        aria-hidden="true"
        style={{
          height: `max(0px, calc(${panelHeight}px + 12px - 5rem - env(safe-area-inset-bottom, 0px)))`,
        }}
      />
      <section
        ref={panelRef}
        data-testid="score-rail"
        data-state={entering ? 'entering' : 'done'}
        aria-label={heading}
        className="mx-auto max-w-md border-t border-border bg-surface text-text"
        style={panelStyle}
      >
        <div style={headerStyle}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{heading}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('stableford')}</span>
        </div>

        {entering ? (
          <>
            <div style={gridStyle}>
              {railStrokes(par).map((strokes) => {
                const selected = score === strokes;
                const isPar = strokes === par;
                const term = termText(strokes);
                const points = pointsFor(strokes);
                return (
                  <button
                    key={strokes}
                    type="button"
                    data-testid="rail-option"
                    data-strokes={strokes}
                    data-points={points}
                    aria-pressed={selected}
                    aria-label={th('scoreRail.buttonAriaLabelPoints', { strokes, name, term, points })}
                    onClick={() => onPick(strokes)}
                    className={selected ? 'bg-primary text-bg-tint dark:text-bg' : 'bg-surface text-text'}
                    style={{
                      ...optionStyle,
                      borderWidth: isPar ? 2 : 1,
                      borderColor: isPar || selected ? 'var(--primary)' : 'var(--border)',
                    }}
                  >
                    <span style={numberStyle}>{strokes}</span>
                    <span style={detailStyle} className={selected ? undefined : 'text-muted'}>
                      {th('scoreRail.detailPoints', { term, points })}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                data-testid="rail-other"
                aria-label={th('scoreRail.otherAriaLabel', { name })}
                onClick={onOther}
                className="bg-bg text-text"
                style={{ ...optionStyle, borderWidth: 1, borderColor: 'var(--border)', fontSize: 14, fontWeight: 600 }}
              >
                {th('scoreRail.other')}
              </button>
            </div>

            {score != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  data-testid="rail-step-down"
                  aria-label={th('scoreCard.decreaseAriaLabel', { name })}
                  onClick={() => onStep(-1)}
                  className="bg-surface text-text"
                  style={stepButtonStyle}
                >
                  −
                </button>
                <button
                  type="button"
                  data-testid="rail-step-up"
                  aria-label={th('scoreCard.increaseAriaLabel', { name })}
                  onClick={() => onStep(1)}
                  className="bg-surface text-text"
                  style={stepButtonStyle}
                >
                  +
                </button>
                <button
                  type="button"
                  data-testid="rail-undo"
                  aria-label={th('scoreCard.undoScoreAriaLabel', { name })}
                  onClick={onUndo}
                  style={undoStyle}
                >
                  {th('scoreCard.undoScore')}
                </button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            data-testid={isLastHole ? 'demo-see-board' : 'demo-next-hole'}
            onClick={onNext}
            className={`${buttonClasses('primary', 'default')} w-full`}
          >
            {isLastHole ? t('seeBoard') : t('nextHole')}
          </button>
        )}

        <Link href={DEMO_EXIT_HREF} data-testid="demo-skip" style={skipStyle}>
          {/* One flex item, so the space before the arrow stays. Inter has no
              «→»: the artboard draws it with system-ui, while our stack would
              fall back to Arial («Inter Fallback»). */}
          <span>
            {`${t('skip')} `}
            <span className="font-[system-ui]">→</span>
          </span>
        </Link>
      </section>
    </>
  );
}
