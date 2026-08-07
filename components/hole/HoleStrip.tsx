'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface HoleStripProps {
  gameId: string;
  currentHole: number;
  /**
   * Hull-numrene i spillets omfang (#1441 splittet cup-dag) — [1..18] for
   * hele runden, [1..9]/[10..18] for front9/back9-segment. Styrer HVILKE
   * celler som rendres OG "completed"-merkingen (n < currentHole): uten
   * dette filteret ville en back9-runde (currentHole 10-18) merket hull
   * 1-9 som fullført selv om de aldri spilles på det spillet. Default hele
   * runden for eldre callsites.
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
      background: 'var(--surface-strong)',
      color: 'var(--bg-tint)',
      fontWeight: 600,
      border: 'none',
    };
  }
  if (state === 'completed') {
    return {
      ...base,
      background: 'var(--hole-completed-bg)',
      color: 'var(--text)',
      fontWeight: 500,
      border: '1px solid var(--border)',
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
  const { gameId, currentHole, holes = DEFAULT_HOLES, sibling = null } = props;
  const t = useTranslations('holes.entry');
  // #1466: union of own + sibling holes, sorted, so a segment game reads as one
  // 1–18 scorecard. Own holes stay linked to this game; sibling holes link
  // across to the other host. `completed` semantics (n < currentHole) are kept
  // positional — the global numbering makes the split invisible.
  const ownHoles = new Set(holes);
  const cells = sibling
    ? Array.from(new Set([...holes, ...sibling.holes])).sort((a, b) => a - b)
    : holes;
  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {cells.map((n) => {
          const state =
            n === currentHole
              ? 'current'
              : n < currentHole
                ? 'completed'
                : 'future';
          const href =
            sibling && !ownHoles.has(n)
              ? `/games/${sibling.gameId}/holes/${n}`
              : `/games/${gameId}/holes/${n}`;
          return (
            <SmartLink
              key={n}
              href={href}
              style={hitAreaStyle}
              aria-label={t('hullAriaLabel', { n })}
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
