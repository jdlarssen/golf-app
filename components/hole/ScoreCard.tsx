'use client';

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';
import { scoreTone, type ScoreTone } from '@/lib/scoring/scoreTone';
import { scoreShape, type ScoreShape as ScoreShapeKind } from '@/lib/scoring/scoreShape';
import { ScoreShape } from '@/components/scoring/ScoreShape';

export interface ScoreCardProps {
  playerId: string;
  name: string;
  initial: string | null;
  extraStrokes: number;
  score: number | null;
  par: number;
  disabled?: boolean;
  /**
   * When true, hides all netto/handicap information on the card: both the
   * `+N SLAG` badge and the «Netto X» helper-text under the name. Used by
   * reveal-modus games (status `active`, `score_visibility = 'reveal'`) so
   * handicap-slag count stays secret until admin presses avslutt.
   * Default false — non-reveal games render both as normal.
   */
  hideNetto?: boolean;
  /**
   * Stableford-poengene for current hull, for current spillerkort. Null
   * betyr at vi enten ikke spiller stableford eller at hullet ikke er
   * tastet ennå. Når satt: vises som «· N poeng» i helper-tekst-en etter
   * netto-verdien. Skjules sammen med netto-info når hideNetto er true.
   */
  stablefordPoints?: number | null;
  onSetScore: (playerId: string, next: number) => void;
  onLongPress: (playerId: string) => void;
  /**
   * Nullstiller scoren for current spiller i ett trykk (tilbake til
   * ghost/par-placeholder). Eksponert via «Angre»-lenka i helper-linja som
   * vises kun når en score er satt — sparer brukeren for ⋯ → ark → X ved en
   * feiltast på banen (#944).
   */
  onClear: (playerId: string) => void;
}

const MIN_STROKES = 1;
// Net double bogey for a 54 HCP on slope 155 lands at ~12 gross on par 5;
// 15 leaves room for honest blow-up entries while still rejecting typos.
const MAX_STROKES = 15;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function scoreNumberFontSize(shape: ScoreShapeKind, displayedNumber: number): number {
  const twoDigit = displayedNumber >= 10;
  if (shape === 'quadruple-square') return twoDigit ? 14 : 18;
  if (shape === 'triple-circle' || shape === 'triple-square') return twoDigit ? 18 : 22;
  if (shape === 'double-circle' || shape === 'double-square') return twoDigit ? 22 : 28;
  return twoDigit ? 26 : 36;
}

function scoreNumberColor(tone: ScoreTone): string {
  switch (tone) {
    case 'under':
      return 'var(--score-under-fg)';
    case 'over2':
      return 'var(--score-over2-fg)';
    case 'par':
    case 'over1':
    default:
      return 'var(--text)';
  }
}

export function ScoreCard(props: ScoreCardProps): JSX.Element {
  const t = useTranslations('holes.scoreCard');
  const {
    playerId,
    name,
    initial,
    extraStrokes,
    score,
    par,
    disabled = false,
    hideNetto = false,
    stablefordPoints = null,
    onSetScore,
    onLongPress,
    onClear,
  } = props;

  const confirmed = score != null;

  const tone: ScoreTone = scoreTone(score, par);
  const shape = scoreShape(score, par);
  const numberColor = scoreNumberColor(tone);
  const isGhost = score == null;
  const displayedNumber = isGhost ? par : score;

  function onCardClick() {
    if (disabled) return;
    // First-entry shortcut: tapping the card with no score yet establishes
    // par as the baseline. Once a score exists (set via this shortcut or via
    // the +/− buttons or the ⋯ menu), tap-to-par would silently wipe the
    // player's input — accidental drags or thumb-rests would reset honest
    // adjustments. Use +/− or ⋯ to change a set score; the card body becomes
    // a no-op surface.
    if (score != null) return;
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

  function onUndo(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    onClear(playerId);
  }

  const borderColor = confirmed ? 'rgba(201,169,97,0.5)' : 'var(--border)';

  const cardStyle: CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid ${borderColor}`,
    borderRadius: 16,
    boxShadow:
      '0 1px 2px rgba(26,46,31,0.04), 0 2px 6px rgba(26,46,31,0.03)',
    padding: '12px 12px 12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    transition: 'border-color 160ms',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };

  const initialChars = initial && initial.length > 0 ? initial : '?';
  const avatarStyle: CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: 'var(--surface-strong)',
    color: 'var(--bg-tint)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-serif)',
    fontSize: initialChars.length > 1 ? 13 : 15,
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

  // Scale font-size based on shape complexity + digit count so the number
  // never clips the innermost ring/box. Nested shapes (triple/quad) eat into
  // the inner area; two-digit numbers need extra headroom on top of that.
  const numberFontSize = scoreNumberFontSize(shape, displayedNumber);

  const numberStyle: CSSProperties = {
    fontSize: numberFontSize,
    letterSpacing: '-0.02em',
    color: isGhost ? 'var(--score-unset-fg)' : numberColor,
    opacity: isGhost ? 0.55 : 1,
  };

  let helperText: string;
  if (score == null) {
    helperText = t('tapInstruction');
  } else if (hideNetto) {
    helperText = '';
  } else {
    const netto = score - extraStrokes;
    // For stableford-modus appendes per-hull-poengene rett etter netto-en
    // for å vise sammenhengen netto → poeng på samme linje (sparer plass
    // og holder per-hull-info atomisk).
    helperText =
      stablefordPoints !== null
        ? t('nettoWithPoints', { netto, points: stablefordPoints })
        : t('nettoLabel', { netto });
  }

  // Glove-vennlige tap-targets: ≥44×44px per appens egen ≥44px-regel
  // (var 38×30). Tastes med hanske, enhåndt, i bevegelse på banen (#944).
  const stepperBtnStyle: CSSProperties = {
    width: 44,
    height: 44,
    border: '1px solid var(--border)',
    borderRadius: 11,
    background: 'var(--surface)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: 'var(--text)',
  };

  // ⋯ holder en lett glyf, men hele knappen er et fullt ≥44px-mål (var h18).
  const moreBtnStyle: CSSProperties = {
    width: 44,
    height: 44,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // «Angre»-lenka: lett understreket tekst, men padding/minHeight gir et
  // ≥44px tap-mål uten å blåse opp helper-linja.
  const undoBtnStyle: CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'underline',
    textUnderlineOffset: 2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    padding: '11px 6px',
    margin: '-9px 0',
    minHeight: 44,
    minWidth: 44,
    display: 'inline-flex',
    alignItems: 'center',
  };

  return (
    <div
      role="button"
      aria-label={t('setScoreAriaLabel', { name })}
      aria-disabled={disabled || undefined}
      style={cardStyle}
      onClick={onCardClick}
    >
      <div style={avatarStyle}>{initialChars}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={nameStyle}>{name}</span>
          {!hideNetto && extraStrokes > 0 && (
            <span style={badgeStyle}>{t('strokesBadge', { n: extraStrokes })}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span data-testid="helper-text" style={helperStyle}>
            {helperText}
          </span>
          {confirmed && !disabled && (
            <button
              type="button"
              aria-label={t('undoScoreAriaLabel', { name })}
              onClick={onUndo}
              style={undoBtnStyle}
            >
              {t('undoScore')}
            </button>
          )}
        </div>
      </div>

      <div
        data-testid="score-shape"
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <ScoreShape shape={shape} tone={tone} size="lg">
          <span
            data-testid="score-number"
            className="score-num"
            style={numberStyle}
          >
            {displayedNumber}
          </span>
        </ScoreShape>
      </div>

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
          aria-label={t('moreAriaLabel')}
          onClick={onStepperMore}
          disabled={disabled}
          style={moreBtnStyle}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
