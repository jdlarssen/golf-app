'use client';

import { useTranslations } from 'next-intl';
import type { FormatLineup as Lineup } from '@/lib/wizard/formatLineup';

/**
 * FormatLineup — the dot figure on the wizard's format cards (#2260): who
 * plays with or against whom, drawn from `formatLineup`. Decoration only
 * (`aria-hidden`); the same information is in the card's text line.
 *
 * The artboard («Forslag: formatkortene») draws four figures for four
 * players; the rest are derived from them. Petrol against terracotta means two
 * sides meeting, forest green is a team, taupe is a player on their own, and
 * the gold pill is the Skins pot. The dots are moved apart from the artboard
 * so the whole «mot» shows.
 */

type Dot = { cx: number; cy: number; r: number; color: string };
type Label = { x: number; y: number; size: number; anchor: 'start' | 'middle' };

export type LineupFigure = {
  width: number;
  height: number;
  viewBox: string;
  dots: Dot[];
  label?: Label;
  pill?: { width: number };
};

const ROW_W = 44;
const ROW_H = 24;
const ROW_R = 4.5;
const ROW_CY = 12;
/** The row figure's four places, left to right. */
const ROW_X = [5, 16, 27, 38];
/** A pair on each side of a row figure: two dots, a gap, two dots. */
const PAIR_X = [5, 14, 30, 39];

const SOLO = 'var(--lineup-solo)';
const TEAM = 'var(--primary)';
const SIDE_A = 'var(--player-a)';
const SIDE_B = 'var(--player-b)';

function row(dots: Dot[], extra: Partial<LineupFigure> = {}): LineupFigure {
  return { width: ROW_W, height: ROW_H, viewBox: `0 0 ${ROW_W} ${ROW_H}`, dots, ...extra };
}

function rowDots(xs: readonly number[], color: string): Dot[] {
  return xs.map((cx) => ({ cx, cy: ROW_CY, r: ROW_R, color }));
}

/** The 44×24 figure a list row draws. */
export function rowFigure(lineup: Lineup): LineupFigure {
  switch (lineup.kind) {
    case 'solo':
      return row(rowDots(ROW_X.slice(0, Math.min(lineup.players, 4)), SOLO));
    case 'pot': {
      const k = Math.min(lineup.players, 4);
      return row(rowDots(ROW_X.slice(0, k), SOLO), { pill: { width: 11 * k - 2 } });
    }
    case 'wolf': {
      const wolf: Dot = { cx: 6, cy: ROW_CY, r: 5.5, color: TEAM };
      const label: Label = { x: 14, y: 16, size: 9, anchor: 'start' };
      if (lineup.opponents >= 4) {
        return row(
          [
            wolf,
            { cx: 34.5, cy: 6.5, r: 3, color: SOLO },
            { cx: 34.5, cy: 17.5, r: 3, color: SOLO },
            { cx: 41.5, cy: 6.5, r: 2.5, color: SOLO },
            { cx: 41.5, cy: 17.5, r: 2.5, color: SOLO },
          ],
          { label },
        );
      }
      const pair: Dot[] = [
        { cx: 35.5, cy: 6.5, r: 4, color: SOLO },
        { cx: 35.5, cy: 17.5, r: 4, color: SOLO },
      ];
      const back: Dot[] = lineup.opponents === 3 ? [{ cx: 41, cy: ROW_CY, r: 3, color: SOLO }] : [];
      return row([wolf, ...pair, ...back], { label });
    }
    case 'sides':
      if (lineup.perSide === 1) {
        return row(
          [
            { cx: 5, cy: ROW_CY, r: ROW_R, color: SIDE_A },
            { cx: 39, cy: ROW_CY, r: ROW_R, color: SIDE_B },
          ],
          { label: { x: 22, y: 16, size: 9, anchor: 'middle' } },
        );
      }
      return row([...rowDots(PAIR_X.slice(0, 2), SIDE_A), ...rowDots(PAIR_X.slice(2), SIDE_B)]);
    case 'teams':
      return row(rowDots(lineup.teams === 1 ? PAIR_X.slice(0, 2) : PAIR_X, TEAM));
    case 'teamSizes':
      return row(rowDots(PAIR_X, TEAM));
  }
}

const CARD_H = 40;
const CARD_R = 9;
const CARD_CY = 20;

/** The 40 px high figure on the recommended card. */
export function cardFigure(lineup: Lineup): LineupFigure {
  const label: Label = { x: 0, y: 25, size: 11, anchor: 'middle' };
  if (lineup.kind === 'sides' && lineup.perSide === 1) {
    return {
      width: 84,
      height: CARD_H,
      viewBox: `0 0 84 ${CARD_H}`,
      dots: [
        { cx: 12, cy: CARD_CY, r: CARD_R, color: SIDE_A },
        { cx: 72, cy: CARD_CY, r: CARD_R, color: SIDE_B },
      ],
      label: { ...label, x: 42 },
    };
  }
  // Three or four a side draw as two against two; the text line has the
  // real number.
  if (lineup.kind === 'sides') {
    return {
      width: 104,
      height: CARD_H,
      viewBox: `0 0 104 ${CARD_H}`,
      dots: [
        { cx: 12, cy: CARD_CY, r: CARD_R, color: SIDE_A },
        { cx: 30, cy: CARD_CY, r: CARD_R, color: SIDE_A },
        { cx: 76, cy: CARD_CY, r: CARD_R, color: SIDE_B },
        { cx: 94, cy: CARD_CY, r: CARD_R, color: SIDE_B },
      ],
      label: { ...label, x: 53 },
    };
  }
  // Every other figure is the row figure scaled up to the card's height.
  const small = rowFigure(lineup);
  return { ...small, width: (ROW_W * CARD_H) / ROW_H, height: CARD_H };
}

export function FormatLineup({
  lineup,
  variant,
}: {
  lineup: Lineup;
  variant: 'card' | 'row';
}) {
  const t = useTranslations('wizard.formatGrid.lineup');
  const figure = variant === 'card' ? cardFigure(lineup) : rowFigure(lineup);
  return (
    <svg
      aria-hidden="true"
      width={figure.width}
      height={figure.height}
      viewBox={figure.viewBox}
      className="shrink-0"
      data-testid="format-lineup"
    >
      {figure.dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.r} style={{ fill: d.color }} />
      ))}
      {figure.label && (
        <text
          x={figure.label.x}
          y={figure.label.y}
          textAnchor={figure.label.anchor}
          fontSize={figure.label.size}
          fontWeight={600}
          className="font-sans"
          style={{ fill: 'var(--text-muted)' }}
        >
          {t('versus')}
        </text>
      )}
      {figure.pill && (
        <rect
          x={1}
          y={1}
          width={figure.pill.width}
          height={22}
          rx={11}
          fill="none"
          strokeWidth={1.5}
          style={{ stroke: 'var(--accent)' }}
        />
      )}
    </svg>
  );
}
