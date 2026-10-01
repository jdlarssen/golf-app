'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import { formatPlayStyle, type GameMode } from '@/lib/scoring/modes/types';
import { useRovingFocus, type RovingProps } from '@/hooks/useRovingFocus';
import { splitFormatsForCount } from '@/lib/wizard/formatRecommendation';
import { formatLineup, type FormatLineup as Lineup } from '@/lib/wizard/formatLineup';
import { Kicker } from '@/components/ui/Kicker';
import { FormatLineup } from './FormatLineup';

type Props = {
  formats: FormatForIntent[];
  value: string | undefined;
  onChange: (slug: string) => void;
  /**
   * Opens the format sheet on one format (#498). «Reglene» on the card and on
   * the selected row call it. Left out → no «Reglene» button.
   */
  onShowGuide?: (slug: string) => void;
  disabled?: boolean;
  /**
   * #2260: the Kompis player count. Set → the recommended card, «Andre som
   * passer» and the rest behind «Se alle N som passer», only formats that fit.
   * Left out (Klubb, Solo, Kompis without a count) → every format as a row
   * under «Vanligst» and «Flere muligheter».
   */
  playerCount?: number;
};

/**
 * FormatGrid — step 2 of the wizard (Kompis / Klubb / Solo). Gets the visible
 * formats for the intent, sorted by `getFormatsForIntent` (is_primary desc,
 * sort_order, format_slug).
 *
 * #2260: the format cards from the artboard «Forslag: formatkortene». With a
 * player count the first format that fits is a large card with its line-up and
 * one sentence on the rule, and three more follow as rows. Every visible
 * option is one radiogroup with one roving tab stop, so the arrow keys move
 * across the card and every row. «Reglene» is always a sibling of the radio,
 * never a button inside a button.
 */
export function FormatGrid({
  formats,
  value,
  onChange,
  onShowGuide,
  disabled = false,
  playerCount,
}: Props) {
  const t = useTranslations('wizard.formatGrid');
  const tCards = useTranslations('wizard.formatCards');
  const tModes = useTranslations('modes');
  const legendId = useId();
  const idPrefix = useId();

  // «Se alle» opens the rest for the count it was pressed at; a new count is a
  // new recommendation and starts folded again.
  const [expandedFor, setExpandedFor] = useState<number | undefined>(undefined);
  const expanded = playerCount !== undefined && expandedFor === playerCount;
  // Once the rest is open, everything that fits is on screen, so the
  // selection never has to move up as an extra row.
  const split = splitFormatsForCount(formats, playerCount, expanded ? undefined : value);
  const withCount = playerCount !== undefined;

  const groups: FormatForIntent[][] = withCount
    ? [
        [
          ...(split.recommended ? [split.recommended] : []),
          ...split.others,
          ...(expanded ? split.rest : []),
        ],
      ]
    : [split.rest.filter((f) => f.is_primary), split.rest.filter((f) => !f.is_primary)];
  const visible = groups.flat();

  const select = (slug: string) => {
    if (!disabled) onChange(slug);
  };
  const roving = useRovingFocus(
    visible.map((f) => f.slug),
    value,
    select,
  );

  // The link disappears when pressed, so focus moves to the first row it
  // revealed instead of falling to <body>.
  const revealedRef = useRef<HTMLElement | null>(null);
  const focusRevealed = useRef(false);
  useLayoutEffect(() => {
    if (!focusRevealed.current) return;
    focusRevealed.current = false;
    revealedRef.current?.focus();
  });

  const name = (slug: string) => tModes(slug as Parameters<typeof tModes>[0]);
  const card = (slug: string, field: 'line' | 'pitch' | 'choose') =>
    tCards(`${slug}.${field}` as Parameters<typeof tCards>[0]);

  function lineupText(lineup: Lineup): string {
    switch (lineup.kind) {
      case 'sides':
        return t('lineup.sides', { count: lineup.perSide });
      case 'teams':
        return t('lineup.teams', { teams: lineup.teams, size: lineup.size });
      case 'teamSizes':
        if (lineup.sizes.length === 2) {
          return t('lineup.teamSizesTwo', { first: lineup.sizes[0], second: lineup.sizes[1] });
        }
        return t('lineup.teamSizesRange', {
          min: Math.min(...lineup.sizes),
          max: Math.max(...lineup.sizes),
        });
      case 'wolf':
        return t('lineup.wolf', { opponents: lineup.opponents });
      case 'pot':
      case 'solo':
        return t('lineup.players', { count: lineup.players });
    }
  }

  function metaLine(slug: string, lineup: Lineup): string {
    const style = formatPlayStyle(slug as GameMode);
    const lineupLabel = lineupText(lineup);
    if (style === 'unknown') return lineupLabel;
    return `${tModes(`playStyle.${style}` as Parameters<typeof tModes>[0])} · ${lineupLabel}`;
  }

  function rulesButton(slug: string, className: string, style?: { outlineOffset: string }) {
    if (!onShowGuide) return null;
    return (
      <button
        type="button"
        onClick={() => onShowGuide(slug)}
        aria-label={t('rulesAriaLabel', { name: name(slug) })}
        style={style}
        className={`shrink-0 rounded-full border border-border bg-surface px-4 font-sans text-sm font-semibold leading-[normal] text-primary ${className}`}
      >
        {t('rules')}
      </button>
    );
  }

  function renderRecommended(f: FormatForIntent, rovingProps: RovingProps) {
    const selected = value === f.slug;
    const lineup = formatLineup(f.slug as GameMode, playerCount!);
    const metaId = `${idPrefix}-${f.slug}-meta`;
    const pitchId = `${idPrefix}-${f.slug}-pitch`;
    return (
      <div
        key={f.slug}
        data-testid="format-recommended"
        className="-mx-1 flex flex-col gap-3 rounded-[18px] border-2 border-primary bg-surface p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-[26px] font-semibold leading-[normal] text-text">
              {name(f.slug)}
            </p>
            <p id={metaId} className="mt-0.5 font-sans text-[13px] leading-[normal] text-muted">
              {metaLine(f.slug, lineup)}
            </p>
          </div>
          <FormatLineup lineup={lineup} variant="card" />
        </div>
        <p id={pitchId} className="font-sans text-[15px] leading-[1.45] text-text">
          {card(f.slug, 'pitch')}
        </p>
        <div className="flex gap-2">
          <button
            {...rovingProps}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-describedby={`${metaId} ${pitchId}`}
            disabled={disabled}
            onClick={() => select(f.slug)}
            className="h-12 flex-1 rounded-full bg-primary font-sans text-[15px] font-semibold leading-[normal] text-white disabled:cursor-not-allowed disabled:opacity-50 dark:text-bg"
          >
            {selected ? (
              <>
                <span aria-hidden="true">✓ </span>
                {t('chosen')}
                <span className="sr-only">: {name(f.slug)}</span>
              </>
            ) : (
              card(f.slug, 'choose')
            )}
          </button>
          {rulesButton(f.slug, 'h-12')}
        </div>
      </div>
    );
  }

  function renderRow(
    f: FormatForIntent,
    rovingProps: RovingProps,
    { divider, withFigure, focusTarget }: { divider: boolean; withFigure: boolean; focusTarget: boolean },
  ) {
    const selected = value === f.slug;
    const nameId = `${idPrefix}-${f.slug}-name`;
    const lineId = `${idPrefix}-${f.slug}-line`;
    const ref = (el: HTMLElement | null) => {
      rovingProps.ref(el);
      if (focusTarget) revealedRef.current = el;
    };
    return (
      <div
        key={f.slug}
        data-testid="format-row"
        // The row's height includes its divider (border-box), as on the
        // artboard: 60 px, 64 px when selected.
        className={`flex items-center ${divider ? 'border-b border-row-divider-warm' : ''} ${
          selected
            ? 'min-h-[64px] bg-primary-soft shadow-[inset_0_0_0_2px_var(--primary)]'
            : 'min-h-[60px]'
        }`}
      >
        {/* Ekstra negativ offset (#1673): den valgte raden har en inset-linje
            på 2 px i primary, så inset-ringen på −2px ville lagt seg rett
            inntil den. −5px flytter ringen inn i radens eget fyll. Inline
            style fordi fokusreglene i globals.css ligger utenfor alle @layer. */}
        <button
          {...rovingProps}
          ref={ref}
          type="button"
          role="radio"
          aria-checked={selected}
          aria-labelledby={nameId}
          aria-describedby={lineId}
          disabled={disabled}
          onClick={() => select(f.slug)}
          style={selected ? { outlineOffset: '-5px' } : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch px-3.5 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          {withFigure && (
            <FormatLineup lineup={formatLineup(f.slug as GameMode, playerCount!)} variant="row" />
          )}
          <span className="min-w-0 flex-1">
            <span
              id={nameId}
              className="block font-sans text-[15px] font-semibold leading-[normal] text-text"
            >
              {name(f.slug)}
            </span>
            <span id={lineId} className="block font-sans text-xs leading-[normal] text-muted">
              {card(f.slug, 'line')}
            </span>
          </span>
          {!selected && (
            // The artboard's «→» is the system font's arrow: Inter as Google
            // Fonts serves it has no U+2192, so the browser falls through to
            // system-ui. The app's own stack would fall to the Arial-based
            // Inter fallback instead (a longer arrow), so the arrow names
            // system-ui itself and matches the artboard on every device.
            <span
              aria-hidden="true"
              className="text-base font-normal leading-[normal] text-primary"
              style={{ fontFamily: 'system-ui, sans-serif' }}
            >
              →
            </span>
          )}
        </button>
        {selected && rulesButton(f.slug, 'mr-3.5 h-11', { outlineOffset: '2px' })}
      </div>
    );
  }

  function rowCard(children: ReactNode) {
    return (
      <div
        data-focus-inset
        className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {children}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <p role="status" className="pt-[18px] font-sans text-sm leading-[normal] text-muted">
        {t('emptyState')}
      </p>
    );
  }

  let index = 0;
  const next = () => roving(index++);

  let body: ReactNode;
  if (withCount) {
    const recommended = split.recommended!;
    const rows = groups[0].slice(1);
    const showLink = !expanded && split.rest.length > 0;
    const firstRevealed = expanded ? split.others.length : -1;
    body = (
      <>
        <Kicker tone="accent" className="pb-2 pt-[18px] leading-[normal]">
          {t('recommendedFor', { count: playerCount })}
        </Kicker>
        {renderRecommended(recommended, next())}
        {split.others.length > 0 && (
          <Kicker className="pb-2 pt-5 leading-[normal]">{t('others')}</Kicker>
        )}
        {rows.length > 0 || showLink
          ? rowCard(
              <>
                {rows.map((f, i) =>
                  renderRow(f, next(), {
                    divider: showLink || i < rows.length - 1,
                    withFigure: true,
                    focusTarget: i === firstRevealed,
                  }),
                )}
                {showLink && (
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={() => {
                      focusRevealed.current = true;
                      setExpandedFor(playerCount);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-center font-sans text-sm font-semibold leading-[normal] text-primary"
                  >
                    {t('seeAll', { count: split.fittingCount })}
                  </button>
                )}
              </>,
            )
          : null}
      </>
    );
  } else {
    const [primary, secondary] = groups;
    const showHeaders = primary.length > 0 && secondary.length > 0;
    const nonEmpty = [
      { key: 'primary', label: t('groupPrimary'), formats: primary },
      { key: 'secondary', label: t('groupSecondary'), formats: secondary },
    ].filter((g) => g.formats.length > 0);
    body = nonEmpty.map((g, gi) => (
      <div key={g.key} className={gi === 0 ? 'pt-[18px]' : 'pt-5'}>
        {showHeaders && <Kicker className="pb-2 leading-[normal]">{g.label}</Kicker>}
        {rowCard(
          g.formats.map((f, i) =>
            renderRow(f, next(), {
              divider: i < g.formats.length - 1,
              withFigure: false,
              focusTarget: false,
            }),
          ),
        )}
      </div>
    ));
  }

  // One radiogroup, named by a screen-reader-only label. Not a fieldset: its
  // legend named the group a second time («Velg spillform, gruppe» before
  // «Velg spillform, radiogruppe»). Every radio carries `disabled` itself.
  return (
    <div role="radiogroup" aria-labelledby={legendId} aria-disabled={disabled || undefined}>
      <p id={legendId} className="sr-only">
        {t('legend')}
      </p>
      {body}
    </div>
  );
}
