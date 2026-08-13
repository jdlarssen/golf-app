'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface HoleStripProps {
  gameId: string;
  currentHole: number;
  /**
   * #1352: hull-numrene spilleren FAKTISK har en score på (server-snapshot ∪
   * usynkede Dexie-rader). Uten dette settet leste stripa «ferdig» rent
   * posisjonelt, så et hoppet-over hull så identisk ut med et tastet — «hva
   * mangler?» kunne ikke besvares før submit-siden. Gjelder KUN egne hull;
   * søsken-celler (se `sibling`) har vi ingen score-data for.
   */
  scoredHoles: ReadonlySet<number>;
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

// #1353: gap 0 — hvert ≥44px-mål ligger kant-i-kant, så senter-til-senter blir
// 44 px uten døde soner mellom cellene. Visuell avstand bæres av differansen
// mellom målet (44) og cellen (26).
const innerStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 0,
};

const hitAreaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 44,
  minHeight: 44,
  textDecoration: 'none',
};

export type HoleCellState = 'current' | 'scored' | 'missed' | 'future';

/**
 * #1352: tilstanden til én celle for et av spillerens EGNE hull.
 *
 * Rekkefølgen er bevisst: `current` vinner alltid (du står der — stripa skal
 * ikke rope «mangler» om hullet du taster nå), deretter `scored` uansett
 * posisjon (en spiller som hopper fram og taster hull 12 før hull 8 skal se
 * hull 12 som ført). Først da faller et hull bak deg uten score til `missed`.
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
    // Tilstanden bæres av rammen + aria-label, ikke av tekstfargen: --warning
    // (#d89b3a) mot linen-bakgrunnen måler ~2,3:1 og består ikke AA på 13 px.
    // Tallet blir derfor i --text. Accent-gull er reservert vinnere.
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

  // #1352: fra ca. hull 12 lå den aktive cellen utenfor skjermen på vanlig
  // mobil. SmartLink er ikke forwardRef, så ref-en må stå på den indre span-en.
  // `scrollIntoView?.` er jsdom-vakten (jsdom implementerer den ikke).
  const activeCellRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    activeCellRef.current?.scrollIntoView?.({
      inline: 'center',
      block: 'nearest',
    });
  }, [currentHole]);

  return (
    <div style={containerStyle}>
      <div style={innerStyle}>
        {cells.map((n) => {
          // Søsken-hull ligger i et ANNET spill — vi har ingen score-data for
          // dem her, så de beholder den posisjonelle avledningen og vises
          // aldri som «mangler» (en falsk anklage er verre enn ingen info).
          const isOwn = ownHoles.has(n);
          const state: HoleCellState = isOwn
            ? holeCellState(n, currentHole, scoredHoles)
            : n < currentHole
              ? 'scored'
              : 'future';
          const href =
            isOwn || !sibling
              ? `/games/${gameId}/holes/${n}`
              : `/games/${sibling.gameId}/holes/${n}`;
          const ariaKey =
            isOwn && state === 'scored'
              ? 'hullAriaLabelDone'
              : isOwn && state === 'missed'
                ? 'hullAriaLabelMissing'
                : 'hullAriaLabel';
          const isCurrent = state === 'current';
          return (
            <SmartLink
              key={n}
              href={href}
              style={hitAreaStyle}
              aria-label={t(ariaKey, { n })}
              aria-current={isCurrent ? 'page' : undefined}
            >
              <span
                ref={isCurrent ? activeCellRef : undefined}
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
