'use client';

import {
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useTranslations } from 'next-intl';
import {
  MAPPING_INTENTS,
  type FormatWithMappings,
  type MappingIntent,
} from '@/lib/formats/types';
import {
  moveWithinSection,
  step2Sections,
  step2SortOrder,
} from '@/lib/formats/step2Order';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { Kicker } from '@/components/ui/Kicker';
import { Switch } from '@/components/ui/Switch';
import { RowStatusChip, type RowStatus } from './RowStatusChip';
import {
  toggleVisibility,
  togglePrimary,
  toggleActive,
  moveFormat,
} from './actions';

type Props = {
  initialFormats: FormatWithMappings[];
};

type Direction = 'up' | 'down';

type Action =
  | { type: 'visibility'; slug: string; intent: MappingIntent; value: boolean }
  | { type: 'primary'; slug: string; intent: MappingIntent; value: boolean }
  | { type: 'active'; slug: string; value: boolean }
  | { type: 'sort_order'; slug: string; intent: MappingIntent; direction: Direction };

/** «Flere muligheter» shows this many rows before «Vis alle». */
const SECONDARY_FOLD = 5;

/** The step-2 group `slug` sits in for `intent`, in step-2 order. */
function groupOf(
  formats: FormatWithMappings[],
  intent: MappingIntent,
  slug: string,
): string[] | null {
  const { primary, secondary } = step2Sections(formats, intent);
  for (const group of [primary, secondary]) {
    if (group.some((f) => f.slug === slug)) return group.map((f) => f.slug);
  }
  return null;
}

function applyAction(
  current: FormatWithMappings[],
  action: Action,
): FormatWithMappings[] {
  if (action.type === 'sort_order') {
    // The same helpers as moveFormat, so the optimistic order is the server's.
    const group = groupOf(current, action.intent, action.slug);
    const moved = group && moveWithinSection(group, action.slug, action.direction);
    if (!moved) return current;
    return current.map((f) => {
      const index = moved.slugs.indexOf(f.slug);
      const existing = f.mappings[action.intent];
      if (index === -1 || !existing) return f;
      return {
        ...f,
        mappings: {
          ...f.mappings,
          [action.intent]: { ...existing, sort_order: step2SortOrder(index) },
        },
      };
    });
  }
  return current.map((f) => {
    if (f.slug !== action.slug) return f;
    if (action.type === 'active') {
      return { ...f, is_active: action.value };
    }
    const existing = f.mappings[action.intent];
    const nextEntry =
      action.type === 'visibility'
        ? {
            is_visible: action.value,
            is_primary: existing?.is_primary ?? false,
            sort_order: existing?.sort_order ?? 100,
          }
        : {
            // Promotering til primary impliserer synlig (matcher server-action)
            is_visible: action.value ? true : (existing?.is_visible ?? false),
            is_primary: action.value,
            sort_order: existing?.sort_order ?? 100,
          };
    return {
      ...f,
      mappings: { ...f.mappings, [action.intent]: nextEntry },
    };
  });
}

function deriveStatus(f: FormatWithMappings): RowStatus {
  if (!f.is_active) return 'inaktiv';
  const hasAnyMapping = MAPPING_INTENTS.some(
    (intent) => f.mappings[intent] !== null,
  );
  if (!hasAnyMapping) return 'ny';
  return 'aktiv';
}

/**
 * FormatsManager — step 2 as the organiser sees it, one intent per tab
 * (#2347, artboard «Forslag: formatene slik veiviseren viser dem»).
 * «Vanligst» and «Flere muligheter» list exactly what `getFormatsForIntent`
 * gives step 2, in its order; the arrows move a format one place within its
 * group, the star moves it between them.
 *
 * Every change runs as a startTransition around addOptimistic + the server
 * action. A server action that redirects with an error reverts the
 * optimistic state on its own.
 */
export function FormatsManager({ initialFormats }: Props) {
  const t = useTranslations('admin.formats');
  const tGrid = useTranslations('wizard.formatGrid');
  const tCards = useTranslations('wizard.formatCards');
  const tModes = useTranslations('modes');
  const [isPending, startTransition] = useTransition();
  const [optimisticFormats, addOptimistic] = useOptimistic(
    initialFormats,
    applyAction,
  );
  const [activeTab, setActiveTab] = useState<MappingIntent>('kompis');
  // Intent tabs follow the tablist keyboard pattern: one tab stop, arrow keys
  // switch tab; each tab points at the format list below.
  const baseId = useId();
  const tabId = (intent: MappingIntent) => `${baseId}-tab-${intent}`;
  const panelId = `${baseId}-panel`;
  const headingId = (group: string) => `${baseId}-${group}`;
  const rovingProps = useRovingFocus(MAPPING_INTENTS, activeTab, setActiveTab);
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [expandedTab, setExpandedTab] = useState<MappingIntent | null>(null);
  const expanded = expandedTab === activeTab;
  const [announcement, setAnnouncement] = useState('');

  // Reordering moves the row's DOM node, which drops focus. Put it back on the
  // arrow that was pressed, or on the row's other arrow once the pressed one is
  // disabled at the edge. Held until the server's answer has rendered too.
  const listRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<{ slug: string; direction: Direction } | null>(null);
  useLayoutEffect(() => {
    const request = focusRequest.current;
    if (!request) return;
    const arrow = (direction: Direction) =>
      listRef.current?.querySelector<HTMLButtonElement>(
        `[data-move="${request.slug}:${direction}"]`,
      );
    const pressed = arrow(request.direction);
    const target =
      pressed && !pressed.disabled
        ? pressed
        : arrow(request.direction === 'up' ? 'down' : 'up');
    if (target && document.activeElement !== target) target.focus();
    if (!isPending) focusRequest.current = null;
  });

  const name = (slug: string) => tModes(slug as Parameters<typeof tModes>[0]);
  const intentLabel = (intent: MappingIntent) =>
    t(`intentLabels.${intent}` as Parameters<typeof t>[0]);

  function submit(action: Action, serverFn: (fd: FormData) => Promise<void>) {
    const fd = new FormData();
    fd.set('format_slug', action.slug);
    if (action.type !== 'active') fd.set('intent', action.intent);
    if (action.type === 'sort_order') fd.set('direction', action.direction);
    else fd.set('next', action.value ? 'on' : 'off');
    startTransition(async () => {
      addOptimistic(action);
      await serverFn(fd);
    });
  }

  function handleMove(slug: string, direction: Direction) {
    const group = groupOf(optimisticFormats, activeTab, slug);
    const moved = group && moveWithinSection(group, slug, direction);
    if (!moved) return;
    focusRequest.current = { slug, direction };
    // A move into the folded part of «Flere muligheter» opens it, so the
    // format stays on screen.
    const isSecondary = !optimisticFormats.find((f) => f.slug === slug)?.mappings[activeTab]
      ?.is_primary;
    if (isSecondary && moved.to >= SECONDARY_FOLD) setExpandedTab(activeTab);
    setAnnouncement(
      t('movedAnnouncement', { format: name(slug), n: moved.to + 1, total: moved.slugs.length }),
    );
    submit({ type: 'sort_order', slug, intent: activeTab, direction }, moveFormat);
  }

  const sections = step2Sections(optimisticFormats, activeTab);
  const secondaryShown = expanded
    ? sections.secondary
    : sections.secondary.slice(0, SECONDARY_FOLD);

  function statusChip(f: FormatWithMappings) {
    if (!showInactive) return null;
    return (
      <RowStatusChip
        status={deriveStatus(f)}
        formatName={name(f.slug)}
        onClick={() => submit({ type: 'active', slug: f.slug, value: !f.is_active }, toggleActive)}
      />
    );
  }

  function arrows(slug: string, index: number, count: number) {
    const arrow = (direction: Direction, disabled: boolean) => (
      <button
        type="button"
        data-move={`${slug}:${direction}`}
        aria-label={t(direction === 'up' ? 'moveUp' : 'moveDown', { format: name(slug) })}
        disabled={disabled}
        onClick={() => handleMove(slug, direction)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg leading-none text-primary disabled:cursor-not-allowed disabled:text-text/25"
      >
        <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>
      </button>
    );
    return (
      <span className="flex shrink-0">
        {arrow('up', index === 0)}
        {arrow('down', index === count - 1)}
      </span>
    );
  }

  function star(f: FormatWithMappings, primary: boolean) {
    return (
      <button
        type="button"
        aria-label={t('primaryAria', { format: name(f.slug), intent: intentLabel(activeTab) })}
        aria-pressed={primary}
        onClick={() =>
          submit({ type: 'primary', slug: f.slug, intent: activeTab, value: !primary }, togglePrimary)
        }
        className={`h-11 w-11 shrink-0 text-xl leading-none transition-colors ${
          // Interaktiv kontroll → WCAG 1.4.11 krever ≥3:1; --accent er ~2,1:1
          // mot lys flate, accent-text klarerer i begge temaer (#1733).
          primary ? 'text-accent-text' : 'text-muted hover:text-accent-text'
        }`}
      >
        <span aria-hidden="true">{primary ? '★' : '☆'}</span>
      </button>
    );
  }

  function visibleSwitch(f: FormatWithMappings, visible: boolean) {
    return (
      <span className="mr-1.5 flex shrink-0">
        <Switch
          checked={visible}
          label={t('visibleAria', { format: name(f.slug), intent: intentLabel(activeTab) })}
          onToggle={() =>
            submit(
              { type: 'visibility', slug: f.slug, intent: activeTab, value: !visible },
              toggleVisibility,
            )
          }
        />
      </span>
    );
  }

  const heading = (group: string, label: string, count: number) => (
    <Kicker as="h2" id={headingId(group)} className="px-1 pb-2 pt-4">
      {`${label} · ${count}`}
    </Kicker>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div
        role="tablist"
        className="grid grid-cols-3 gap-1 rounded-full bg-meter-track p-1"
      >
        {MAPPING_INTENTS.map((intent, idx) => (
          <button
            key={intent}
            {...rovingProps(idx)}
            role="tab"
            type="button"
            id={tabId(intent)}
            aria-controls={panelId}
            aria-selected={activeTab === intent}
            onClick={() => setActiveTab(intent)}
            // Drawn 40 px as the artboard; `.tap-extend` grows the hit area
            // into the track's 4 px padding, to 44 px.
            className={`tap-extend h-10 rounded-full text-[13px] font-semibold leading-[normal] [--tap-extend:-2px_0] ${
              activeTab === intent
                ? 'bg-surface text-primary shadow-[0_1px_3px_rgba(26,46,31,0.12)]'
                : 'text-muted hover:text-text'
            }`}
          >
            {intentLabel(intent)}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(activeTab)}
      >
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {sections.primary.length > 0 && (
          <section aria-labelledby={headingId('primary')} data-testid="format-group-primary">
            {heading('primary', tGrid('groupPrimary'), sections.primary.length)}
            <ol className="flex flex-col gap-2">
              {sections.primary.map((f, i) => (
                <li
                  key={f.slug}
                  data-format-slug={f.slug}
                  className="flex items-center gap-2 rounded-[14px] border-2 border-primary bg-surface py-1.5 pl-1 pr-1.5"
                >
                  {arrows(f.slug, i, sections.primary.length)}
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[15px] font-semibold leading-[normal] text-text">
                      {name(f.slug)}
                    </span>
                    <span className="mt-0.5 block font-sans text-xs leading-[normal] text-muted">
                      {tCards(`${f.slug}.line` as Parameters<typeof tCards>[0])}
                    </span>
                  </span>
                  {statusChip(f)}
                  {star(f, true)}
                  {visibleSwitch(f, true)}
                </li>
              ))}
            </ol>
          </section>
        )}

        {sections.secondary.length > 0 && (
          <section aria-labelledby={headingId('secondary')} data-testid="format-group-secondary">
            {heading('secondary', tGrid('groupSecondary'), sections.secondary.length)}
            <ol
              id={headingId('secondary-list')}
              data-focus-inset
              className="overflow-hidden rounded-[14px] border border-border bg-surface"
            >
              {secondaryShown.map((f, i) => (
                <li
                  key={f.slug}
                  data-format-slug={f.slug}
                  className={`flex items-center gap-2 py-1 pl-1 pr-1.5 ${
                    i < secondaryShown.length - 1 ? 'border-b border-row-divider-warm' : ''
                  }`}
                >
                  {arrows(f.slug, i, sections.secondary.length)}
                  <span className="min-w-0 flex-1 font-sans text-[15px] font-semibold leading-[normal] text-text">
                    {name(f.slug)}
                  </span>
                  {statusChip(f)}
                  {star(f, false)}
                  {visibleSwitch(f, true)}
                </li>
              ))}
            </ol>
            {sections.secondary.length > SECONDARY_FOLD && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={headingId('secondary-list')}
                onClick={() => setExpandedTab(expanded ? null : activeTab)}
                className="flex min-h-[44px] w-full items-center justify-center font-sans text-[13px] font-semibold text-primary"
              >
                {expanded
                  ? t('showFewer')
                  : t('showAll', { n: sections.secondary.length })}
              </button>
            )}
          </section>
        )}

        {sections.hidden.length > 0 && (
          <section aria-labelledby={headingId('hidden')} data-testid="format-group-hidden">
            {heading(
              'hidden',
              t('hiddenHeading', { intent: intentLabel(activeTab) }),
              sections.hidden.length,
            )}
            <ul className="flex flex-col gap-2">
              {sections.hidden.map((f) => (
                <li
                  key={f.slug}
                  data-format-slug={f.slug}
                  className="flex items-center gap-2 rounded-[14px] border border-dashed border-otp-divider py-1 pl-3 pr-1.5"
                >
                  <span className="min-w-0 flex-1 py-3 font-sans text-sm leading-[normal] text-muted">
                    {name(f.slug)}
                  </span>
                  {statusChip(f)}
                  {visibleSwitch(f, false)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {showInactive && sections.inactive.length > 0 && (
          <section aria-labelledby={headingId('inactive')} data-testid="format-group-inactive">
            {heading('inactive', t('inactiveHeading'), sections.inactive.length)}
            <ul className="overflow-hidden rounded-[14px] border border-border bg-surface-2">
              {sections.inactive.map((f, i) => (
                <li
                  key={f.slug}
                  data-format-slug={f.slug}
                  className={`flex min-h-[52px] items-center gap-2 px-3 ${
                    i < sections.inactive.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1 font-sans text-sm leading-[normal] text-muted">
                    {name(f.slug)}
                  </span>
                  {statusChip(f)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="tap-extend mt-4 flex w-fit cursor-pointer items-center gap-2 px-1 text-xs text-muted [--tap-extend:-14px_-6px]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('showInactive')}
        </label>
      </div>
    </div>
  );
}
