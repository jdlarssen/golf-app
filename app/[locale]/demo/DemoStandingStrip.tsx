'use client';

import type { CSSProperties, JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { DemoStanding } from '@/lib/demo/standing';

const BOARD_ID = 'demo-board';

const stripStyle: CSSProperties = {
  margin: '12px 16px 0 16px',
  width: 'calc(100% - 32px)',
  borderRadius: 16,
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  border: 'none',
  textAlign: 'left',
  font: 'inherit',
  lineHeight: 'normal',
  cursor: 'pointer',
};

const kickerStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  opacity: 0.8,
};

const placeStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 17,
  fontWeight: 600,
};

const arrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--on-strong-arrow)',
  whiteSpace: 'nowrap',
};

export interface DemoStandingStripProps {
  standing: DemoStanding | null;
  open: boolean;
  onToggle: () => void;
  /** The whole board, shown under the strip when it is open. */
  board: ReactNode;
}

type StandingT = ReturnType<typeof useTranslations<'demo.standing'>>;
type BoardT = ReturnType<typeof useTranslations<'leaderboard.board'>>;

/**
 * What the strip says: the place in serif, the rest after it, and the whole
 * meaning as one sentence for a screen reader.
 */
function stripText(
  standing: DemoStanding | null,
  t: StandingT,
  tb: BoardT,
): { place: string | null; detail: string; separator: string; srText: string } {
  if (!standing) return { place: null, detail: t('empty'), separator: '', srText: t('srEmpty') };
  const { rank, tied, gap, leaderName } = standing;
  if (rank === 1 && tied && leaderName) {
    // «Delt 1. plass med Marte» reads as one phrase, without « · ».
    return {
      place: tb('stripTiedPlace', { rank }),
      detail: t('sharedLead', { name: leaderName }),
      separator: ' ',
      srText: t('srSharedLead', { name: leaderName }),
    };
  }
  if (rank === 1) {
    return { place: tb('stripPlace', { rank }), detail: t('leading'), separator: ' · ', srText: t('srLeading') };
  }
  const place = tied ? tb('stripTiedPlace', { rank }) : tb('stripPlace', { rank });
  if (gap == null || !leaderName) return { place, detail: '', separator: '', srText: place };
  return {
    place,
    detail: tb('behindPoints', { gap, name: leaderName }),
    separator: ' · ',
    srText: t(tied ? 'srTiedBehind' : 'srBehind', { rank, gap, name: leaderName }),
  };
}

/**
 * The green strip at the top of the demo (#2281): your place on the board the
 * moment a score is set. Tapping it folds the whole board out underneath.
 */
export function DemoStandingStrip(props: DemoStandingStripProps): JSX.Element {
  const t = useTranslations('demo.standing');
  const tb = useTranslations('leaderboard.board');
  const { standing, open, onToggle, board } = props;

  const movement = standing?.movement ?? 0;
  const text = stripText(standing, t, tb);
  const srText =
    movement === 0
      ? text.srText
      : text.srText + (movement > 0 ? t('srUp', { n: movement }) : t('srDown', { n: -movement }));
  const { place, detail, separator } = text;

  return (
    <>
      <button
        type="button"
        data-testid="demo-standing"
        data-focus-surface="strong"
        aria-expanded={open}
        aria-controls={BOARD_ID}
        aria-label={srText}
        onClick={onToggle}
        // The strip is drawn 40 px high; the hit area reaches 44 px (#2240).
        className="tap-extend bg-surface-strong text-on-strong [--tap-extend:-2px_0px]"
        style={stripStyle}
      >
        <span aria-hidden="true" style={kickerStyle}>
          {t('kicker')}
        </span>
        <span aria-hidden="true" style={{ flexGrow: 1, minWidth: 0, fontSize: 14 }}>
          {place != null ? (
            <>
              <span style={placeStyle}>{place}</span>
              {detail ? `${separator}${detail}` : null}
            </>
          ) : (
            detail
          )}
        </span>
        {movement !== 0 && (
          <span aria-hidden="true" data-testid="demo-standing-arrow" style={arrowStyle}>
            {/* Inter has no ▲/▼. The artboard falls back to system-ui for it;
                next/font's Arial-based «Inter Fallback» would draw a bigger
                triangle first (as LandingLiveBoard). */}
            <span className="font-[system-ui]">{movement > 0 ? '▲' : '▼'}</span>{' '}
            {Math.abs(movement)}
          </span>
        )}
      </button>
      {/* Says the new place out loud; silent until the first score and while
          the place stays the same. */}
      <p className="sr-only" aria-live="polite" data-testid="demo-standing-announcement">
        {standing
          ? t(standing.tied ? 'liveTied' : 'live', { rank: standing.rank })
          : ''}
      </p>
      {open && (
        <div id={BOARD_ID} data-testid="demo-board" style={{ margin: '12px 16px 0 16px' }}>
          {board}
        </div>
      )}
    </>
  );
}
