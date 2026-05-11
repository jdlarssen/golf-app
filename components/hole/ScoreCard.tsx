'use client';

import { useRef, type CSSProperties, type PointerEvent, type JSX } from 'react';
import {
  scoreTone,
  deltaLabel,
  type ScoreTone,
} from '../../lib/scoring/scoreTone';

export interface ScoreCardProps {
  playerId: string;
  name: string;
  initial: string | null;
  extraStrokes: number;
  score: number | null;
  par: number;
  confirmed: boolean;
  mode: 'swipe' | 'buttons';
  disabled?: boolean;
  onSetScore: (playerId: string, next: number) => void;
  onLongPress: (playerId: string) => void;
}

const MIN_STROKES = 1;
const MAX_STROKES = 12;
const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 4;
const SWIPE_THRESHOLD = 16;
const TAP_THRESHOLD = 8;
const DRAG_CLAMP = 40;
const TRANSLATE_MAX = 10;
const TRANSLATE_RATIO = 0.25;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

type ToneColors = { bg: string; fg: string };

const PILL_COLORS: Record<ScoreTone, ToneColors> = {
  unset: { bg: 'rgba(92,83,71,0.10)', fg: '#5C5347' },
  under: { bg: 'rgba(74,124,89,0.16)', fg: '#2F5A3C' },
  par: { bg: 'rgba(92,83,71,0.10)', fg: '#5C5347' },
  over1: { bg: 'rgba(216,155,58,0.18)', fg: '#7A5410' },
  over2: { bg: 'rgba(184,70,62,0.16)', fg: '#7A2F2A' },
};

function scoreNumberColor(tone: ScoreTone): string {
  switch (tone) {
    case 'under':
      return '#2F5A3C';
    case 'over2':
      return '#7A2F2A';
    case 'par':
    case 'over1':
    default:
      return 'var(--text)';
  }
}

export function ScoreCard(props: ScoreCardProps): JSX.Element {
  const {
    playerId,
    name,
    initial,
    extraStrokes,
    score,
    par,
    confirmed,
    mode,
    disabled = false,
    onSetScore,
    onLongPress,
  } = props;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef<boolean>(false);
  const lastDy = useRef<number>(0);
  const dragRef = useRef<HTMLDivElement | null>(null);

  const tone: ScoreTone = scoreTone(score, par);
  const pill = PILL_COLORS[tone];
  const numberColor = scoreNumberColor(tone);
  const isGhost = score == null;
  const displayedNumber = isGhost ? par : score;

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function applyTranslate(dy: number) {
    if (!dragRef.current) return;
    const clamped = clamp(dy, -DRAG_CLAMP, DRAG_CLAMP);
    const translated = clamp(
      clamped * TRANSLATE_RATIO,
      -TRANSLATE_MAX,
      TRANSLATE_MAX,
    );
    dragRef.current.style.transform = `translateY(${translated}px)`;
    const arrow = dragRef.current.querySelector(
      '[data-swipe-arrow]',
    ) as HTMLElement | null;
    if (arrow) {
      if (dy < -TAP_THRESHOLD) {
        arrow.textContent = '↑';
        arrow.style.opacity = String(Math.min(1, Math.abs(dy) / 30));
      } else if (dy > TAP_THRESHOLD) {
        arrow.textContent = '↓';
        arrow.style.opacity = String(Math.min(1, Math.abs(dy) / 30));
      } else {
        arrow.style.opacity = '0';
      }
    }
  }

  function resetTranslate() {
    if (!dragRef.current) return;
    dragRef.current.style.transform = '';
    const arrow = dragRef.current.querySelector(
      '[data-swipe-arrow]',
    ) as HTMLElement | null;
    if (arrow) arrow.style.opacity = '0';
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || mode !== 'swipe') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-stepper]')) return;
    try {
      (e.currentTarget as Element & {
        setPointerCapture: (id: number) => void;
      }).setPointerCapture(e.pointerId);
    } catch {
      // jsdom or older browsers may not support it; safe to ignore.
    }
    startY.current = e.clientY;
    moved.current = false;
    lastDy.current = 0;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      if (!moved.current) {
        onLongPress(playerId);
      }
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (disabled || mode !== 'swipe') return;
    if (startY.current == null) return;
    const dy = e.clientY - startY.current;
    lastDy.current = dy;
    if (Math.abs(dy) > MOVE_THRESHOLD) {
      moved.current = true;
      clearLongPress();
    }
    applyTranslate(dy);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (disabled || mode !== 'swipe') return;
    if (startY.current == null) {
      clearLongPress();
      resetTranslate();
      return;
    }
    clearLongPress();
    const dy = e.clientY - startY.current;
    startY.current = null;
    resetTranslate();

    if (Math.abs(dy) < TAP_THRESHOLD && !moved.current) {
      onSetScore(playerId, clamp(par, MIN_STROKES, MAX_STROKES));
      return;
    }
    if (dy <= -SWIPE_THRESHOLD) {
      onSetScore(playerId, clamp((score ?? par) + 1, MIN_STROKES, MAX_STROKES));
      return;
    }
    if (dy >= SWIPE_THRESHOLD) {
      onSetScore(playerId, clamp((score ?? par) - 1, MIN_STROKES, MAX_STROKES));
      return;
    }
  }

  function onCardClick() {
    if (disabled || mode !== 'buttons') return;
    onSetScore(playerId, clamp(par, MIN_STROKES, MAX_STROKES));
  }

  function onStepperPlus(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    onSetScore(playerId, clamp((score ?? par) + 1, MIN_STROKES, MAX_STROKES));
  }

  function onStepperMinus(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    onSetScore(playerId, clamp((score ?? par) - 1, MIN_STROKES, MAX_STROKES));
  }

  function onStepperMore(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    onLongPress(playerId);
  }

  const borderColor = confirmed ? 'rgba(201,169,97,0.5)' : '#E5E0D3';
  const padding = mode === 'swipe' ? '14px 16px' : '12px 12px 12px 16px';
  const gap = mode === 'swipe' ? '14px' : '10px';

  const cardStyle: CSSProperties = {
    background: '#FFFFFF',
    border: `1px solid ${borderColor}`,
    borderRadius: 16,
    boxShadow:
      '0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)',
    padding,
    display: 'flex',
    alignItems: 'center',
    gap,
    transition: 'border-color 160ms',
    userSelect: 'none',
    touchAction: mode === 'swipe' ? 'none' : 'auto',
    cursor: disabled
      ? 'not-allowed'
      : mode === 'swipe'
        ? 'grab'
        : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };

  const avatarStyle: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--primary)',
    color: '#F0EDE5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-serif)',
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: '-0.02em',
    flexShrink: 0,
  };

  const nameStyle: CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: 17,
    fontWeight: 500,
    letterSpacing: '-0.005em',
  };

  const badgeStyle: CSSProperties = {
    fontSize: 9.5,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    color: 'var(--accent)',
    marginLeft: 8,
  };

  const helperStyle: CSSProperties = {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  };

  const numberStyle: CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: 38,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: 42,
    lineHeight: 1,
    color: isGhost ? '#9A8F7C' : numberColor,
    opacity: isGhost ? 0.55 : 1,
  };

  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    fontVariantNumeric: 'tabular-nums',
    padding: '3px 7px',
    borderRadius: 9999,
    minWidth: 28,
    background: pill.bg,
    color: pill.fg,
  };

  let helperText: string;
  if (confirmed) {
    helperText = 'Bekreftet';
  } else if (score == null) {
    helperText =
      mode === 'swipe'
        ? 'Tap = par. Sveip for +/−.'
        : 'Tap kort = par. Bruk − / +.';
  } else {
    helperText = 'Justert · tap igjen for å bekrefte';
  }

  const stepperBtnStyle: CSSProperties = {
    width: 38,
    height: 30,
    border: '1px solid var(--border)',
    borderRadius: 9,
    background: 'var(--surface)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: 'var(--text)',
  };

  const moreBtnStyle: CSSProperties = {
    height: 18,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div
      ref={dragRef}
      role="button"
      aria-label={`Sett score for ${name}`}
      aria-disabled={disabled || undefined}
      style={cardStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={mode === 'buttons' ? onCardClick : undefined}
    >
      <div style={avatarStyle}>{initial && initial.length > 0 ? initial : '?'}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={nameStyle}>{name}</span>
          {extraStrokes > 0 && (
            <span style={badgeStyle}>+{extraStrokes} SLAG</span>
          )}
        </div>
        <div style={helperStyle}>{helperText}</div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'relative',
        }}
      >
        {mode === 'swipe' && (
          <span
            data-swipe-arrow
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: -16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--accent)',
              fontSize: 14,
              opacity: 0,
              transition: 'opacity 80ms',
              pointerEvents: 'none',
            }}
          />
        )}
        <span data-testid="score-number" style={numberStyle}>
          {displayedNumber}
        </span>
        <span data-testid="delta-pill" style={pillStyle}>
          {deltaLabel(score, par)}
        </span>
      </div>

      {mode === 'buttons' && (
        <div
          data-stepper
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginLeft: 4,
          }}
        >
          <button
            type="button"
            aria-label="+1"
            onClick={onStepperPlus}
            disabled={disabled}
            style={{ ...stepperBtnStyle, fontSize: 16 }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="-1"
            onClick={onStepperMinus}
            disabled={disabled}
            style={{ ...stepperBtnStyle, fontSize: 18 }}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Velg spesifikk score"
            onClick={onStepperMore}
            disabled={disabled}
            style={moreBtnStyle}
          >
            ⋯
          </button>
        </div>
      )}
    </div>
  );
}
