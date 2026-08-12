'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface HoleStripProps {
  gameId: string;
  currentHole: number;
  /**
   * #1352: the hole numbers this player already has a score on (server
   * snapshot ∪ the live Dexie queue). Without it the strip could only read
   * state from position, so a hole you skipped looked exactly like one you
   * played — "what am I missing?" was unanswerable until the submit screen.
   */
  scoredHoles: ReadonlySet<number>;
  /**
   * Hull-numrene i spillets omfang (#1441 splittet cup-dag) — [1..18] for
   * hele runden, [1..9]/[10..18] for front9/back9-segment. Styrer HVILKE
   * celler som rendres OG "missed"-merkingen (n < currentHole uten score):
   * uten dette filteret ville en back9-runde (currentHole 10-18) merket hull
   * 1-9 selv om de aldri spilles på det spillet. Default hele runden for
   * eldre callsites.
   */
  holes?: number[];
  /**
   * #1466 (eier-tillegget): søsterspillets hull på en splittet cup-dag. Når
   * satt rendres unionen av egne og søsken-hull (1–18 sortert stigende) — «som
   * et helt vanlig scorekort». Egne hull lenker til dette spillet; søsken-hull
   * lenker til `/games/<sibling.gameId>/holes/<n>`. Uten (vanlige spill,
   * 'full'-segment, trukket fra én halvdel) vises kun `holes` — uendret.
   */
  sibling?: { gameId: string; holes: number[] } | null;
}

const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

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

export type HoleCellState = 'current' | 'scored' | 'missed' | 'future';

/**
 * #1352: cell state for hole `n`. Precedence is deliberate — `current` wins
 * over everything (you are standing there, whatever the card says), then any
 * hole with a score reads as `scored` no matter where it sits relative to the
 * current hole (you are allowed to jump around the strip). Only a hole you
 * have already walked past WITHOUT a score is `missed`; everything else ahead
 * of you is simply `future`.
 */
export function holeCellState(
  n: number,
  currentHole: number,
  scoredHoles: ReadonlySet<number>,
): HoleCellState {
  if (n === currentHole) return 'current';
  if (scoredHoles.has(n)) return 'scored';
  if (n < currentHole) return 'missed';
  return 'future';
}

function cellStyle(state: HoleCellState): CSSProperties {
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
      background: 'var(--surface-strong)',
      color: 'var(--bg-tint)',
      fontWeight: 600,
      border: 'none',
    };
  }
  if (state === 'scored') {
    return {
      ...base,
      background: 'var(--hole-completed-bg)',
      color: 'var(--text)',
      fontWeight: 500,
      border: '1px solid var(--border)',
    };
  }
  if (state === 'missed') {
    // #1352: a hole you walked past without a score. Dashed warning outline,
    // number kept in full --text so it stays readable — never accent gold,
    // which is reserved for winners/highlights.
    return {
      ...base,
      background: 'transparent',
      color: 'var(--text)',
      fontWeight: 500,
      border: '1px dashed var(--warning)',
    };
  }
  return {
    ...base,
    background: 'transparent',
    color: 'var(--text-muted)',
    fontWeight: 600,
    border: 'none',
  };
}

export function HoleStrip(props: HoleStripProps): JSX.Element {
  const {
    gameId,
    currentHole,
    scoredHoles,
    holes = DEFAULT_HOLES,
    sibling = null,
  } = props;
  const t = useTranslations('holes.entry');
  // #1466: union of own + sibling holes, sorted, so a segment game reads as one
  // 1–18 scorecard. Own holes stay linked to this game; sibling holes link
  // across to the other host.
  const ownHoles = new Set(holes);
  const cells = sibling
    ? Array.from(new Set([...holes, ...sibling.holes])).sort((a, b) => a - b)
    : holes;

  // #1352: keep the active cell on screen. 18 cells scroll wider than a phone,
  // so from ~hole 12 the current marker sat outside the viewport. SmartLink is
  // not a forwardRef, so the ref goes on the inner span. jsdom has no
  // scrollIntoView — the optional call keeps render tests from crashing.
  const activeCellRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeCellRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [currentHole]);

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {cells.map((n) => {
          const isOwn = !sibling || ownHoles.has(n);
          let state = holeCellState(n, currentHole, scoredHoles);
          // A sibling hole belongs to the other host, whose scores this page
          // never fetches — we cannot tell "played" from "skipped" there. Keep
          // those cells on the pre-#1352 positional reading instead of
          // accusing the player of a gap we have no data for.
          if (state === 'missed' && !isOwn) state = 'scored';
          const href =
            sibling && !ownHoles.has(n)
              ? `/games/${sibling.gameId}/holes/${n}`
              : `/games/${gameId}/holes/${n}`;
          const ariaLabel =
            state === 'scored'
              ? t('hullAriaLabelDone', { n })
              : state === 'missed'
                ? t('hullAriaLabelMissing', { n })
                : t('hullAriaLabel', { n });
          return (
            <SmartLink
              key={n}
              href={href}
              style={hitAreaStyle}
              aria-label={ariaLabel}
              aria-current={state === 'current' ? 'page' : undefined}
            >
              <span
                ref={state === 'current' ? activeCellRef : undefined}
                style={cellStyle(state)}
              >
                {n}
              </span>
            </SmartLink>
          );
        })}
      </div>
    </div>
  );
}
