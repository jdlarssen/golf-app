'use client';

import { useOptimistic, useState, useTransition } from 'react';
import {
  MAPPING_INTENTS,
  type FormatWithMappings,
  type MappingIntent,
} from '@/lib/formats/types';
import { formatIconFor } from '@/lib/formats/icons';
import { RowStatusChip, type RowStatus } from './RowStatusChip';
import {
  toggleVisibility,
  togglePrimary,
  toggleCupEligible,
  toggleActive,
  updateFormatContent,
} from './actions';

type Props = {
  initialFormats: FormatWithMappings[];
};

const INTENT_LABELS: Record<MappingIntent, string> = {
  kompis: 'Kompis',
  klubb: 'Klubb',
  solo: 'Solo',
};

type Action =
  | { type: 'visibility'; slug: string; intent: MappingIntent; value: boolean }
  | { type: 'primary'; slug: string; intent: MappingIntent; value: boolean }
  | { type: 'cup_eligible'; slug: string; value: boolean }
  | { type: 'active'; slug: string; value: boolean };

function applyAction(
  current: FormatWithMappings[],
  action: Action,
): FormatWithMappings[] {
  return current.map((f) => {
    if (f.slug !== action.slug) return f;
    if (action.type === 'cup_eligible') {
      return { ...f, is_cup_eligible: action.value };
    }
    if (action.type === 'active') {
      return { ...f, is_active: action.value };
    }
    if (action.type === 'visibility' || action.type === 'primary') {
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
    }
    return f;
  });
}

function deriveStatus(f: FormatWithMappings): RowStatus {
  if (!f.is_active) return 'inaktiv';
  const hasAnyMapping = MAPPING_INTENTS.some(
    (intent) => f.mappings[intent] !== null,
  );
  if (!hasAnyMapping && !f.is_cup_eligible) return 'ny';
  return 'aktiv';
}

/**
 * FormatsManager — eier optimistic state for hele matrix + cup-section.
 * Render-er BÅDE desktop matrix (md+) og mobile tabs (< md) via Tailwind
 * responsive klasser så vi unngår dupliserte state-mountings.
 *
 * Hver toggle kjøres som en startTransition rundt addOptimistic + server-
 * action FormData-call. Hvis server-action redirecter (med error), reverteres
 * optimistic state automatisk av React.
 */
export function FormatsManager({ initialFormats }: Props) {
  const [, startTransition] = useTransition();
  const [optimisticFormats, addOptimistic] = useOptimistic(
    initialFormats,
    applyAction,
  );
  const [activeTab, setActiveTab] = useState<MappingIntent>('kompis');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [expandedEditor, setExpandedEditor] = useState<string | null>(null);

  function submit(action: Action, serverFn: typeof toggleVisibility) {
    const fd = new FormData();
    fd.set('format_slug', action.slug);
    if (action.type === 'visibility' || action.type === 'primary') {
      fd.set('intent', action.intent);
    }
    fd.set('next', action.value ? 'on' : 'off');
    startTransition(async () => {
      addOptimistic(action);
      await serverFn(fd);
    });
  }

  function handleVisibilityToggle(
    slug: string,
    intent: MappingIntent,
    nextValue: boolean,
  ) {
    submit({ type: 'visibility', slug, intent, value: nextValue }, toggleVisibility);
  }

  function handlePrimaryToggle(
    slug: string,
    intent: MappingIntent,
    nextValue: boolean,
  ) {
    submit({ type: 'primary', slug, intent, value: nextValue }, togglePrimary);
  }

  function handleCupEligibleToggle(slug: string, nextValue: boolean) {
    submit({ type: 'cup_eligible', slug, value: nextValue }, toggleCupEligible);
  }

  function handleActiveToggle(slug: string, nextValue: boolean) {
    submit({ type: 'active', slug, value: nextValue }, toggleActive);
  }

  const visibleFormats = showInactive
    ? optimisticFormats
    : optimisticFormats.filter((f) => f.is_active);

  const cupFormats = optimisticFormats.filter((f) => f.is_cup_eligible || !f.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-sans text-xs text-muted">
          Toggles oppdateres umiddelbart. Synlige endringer treffer wizarden
          neste gang den lastes inn.
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Vis inaktive
        </label>
      </div>

      {/* Desktop matrix */}
      <div className="hidden md:block">
        <DesktopMatrix
          formats={visibleFormats}
          onVisibility={handleVisibilityToggle}
          onPrimary={handlePrimaryToggle}
          onActive={handleActiveToggle}
          onCupEligible={handleCupEligibleToggle}
        />
      </div>

      {/* Content editors */}
      <ContentEditorSection
        formats={optimisticFormats}
        expandedSlug={expandedEditor}
        onToggle={(slug) =>
          setExpandedEditor((prev) => (prev === slug ? null : slug))
        }
      />

      {/* Mobile tabs */}
      <div className="md:hidden space-y-4">
        <div role="tablist" className="grid grid-cols-3 gap-2">
          {MAPPING_INTENTS.map((intent) => (
            <button
              key={intent}
              role="tab"
              type="button"
              aria-selected={activeTab === intent}
              onClick={() => setActiveTab(intent)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === intent
                  ? 'border-primary bg-primary-soft text-text'
                  : 'border-border bg-surface text-text'
              }`}
            >
              {INTENT_LABELS[intent]}
            </button>
          ))}
        </div>

        <ul className="space-y-2">
          {visibleFormats.map((f) => {
            const mapping = f.mappings[activeTab];
            const visible = mapping?.is_visible ?? false;
            const primary = mapping?.is_primary ?? false;
            return (
              <li
                key={f.slug}
                className={`rounded-lg border p-3 ${
                  f.is_active ? 'border-border bg-surface' : 'border-border bg-surface-2 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{formatIconFor(f.icon_key, 22)}</span>
                    <span className="font-serif text-sm text-text">
                      {f.display_name}
                    </span>
                  </div>
                  <RowStatusChip
                    status={deriveStatus(f)}
                    onClick={() => handleActiveToggle(f.slug, !f.is_active)}
                  />
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={visible}
                      disabled={!f.is_active}
                      onChange={(e) =>
                        handleVisibilityToggle(f.slug, activeTab, e.target.checked)
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    Synlig
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={primary}
                      disabled={!f.is_active}
                      onChange={(e) =>
                        handlePrimaryToggle(f.slug, activeTab, e.target.checked)
                      }
                      className="h-4 w-4 accent-primary"
                    />
                    Primary
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        <details className="rounded-lg border border-border bg-surface" open>
          <summary className="cursor-pointer px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Cup-eligible formats
          </summary>
          <ul className="border-t border-border">
            {cupFormats.map((f) => (
              <li
                key={f.slug}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${
                  f.is_active ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted">{formatIconFor(f.icon_key, 20)}</span>
                  <span className="font-serif text-sm text-text">
                    {f.display_name}
                  </span>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.is_cup_eligible}
                    disabled={!f.is_active}
                    onChange={(e) =>
                      handleCupEligibleToggle(f.slug, e.target.checked)
                    }
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </li>
            ))}
            {cupFormats.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted">
                Ingen cup-eligible formats.
              </li>
            )}
          </ul>
        </details>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content editor section
// ---------------------------------------------------------------------------

function ContentEditorSection({
  formats,
  expandedSlug,
  onToggle,
}: {
  formats: FormatWithMappings[];
  expandedSlug: string | null;
  onToggle: (slug: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        Forklaringstekster
      </p>
      <div className="rounded-lg border border-border bg-surface divide-y divide-border">
        {formats.map((f) => (
          <ContentEditorRow
            key={f.slug}
            format={f}
            isOpen={expandedSlug === f.slug}
            onToggle={() => onToggle(f.slug)}
          />
        ))}
      </div>
    </div>
  );
}

function ContentEditorRow({
  format,
  isOpen,
  onToggle,
}: {
  format: FormatWithMappings;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const pointsDefaultValue = format.rules_points
    ? format.rules_points.join('\n')
    : '';

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <span className="font-serif text-sm text-text">{format.display_name}</span>
          {(format.rules_summary || format.rules_points || format.rules_long || format.rules_example) && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-sans text-[10px] text-primary">
              Redigert
            </span>
          )}
        </span>
        <span className="font-sans text-xs text-muted" aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <form
          action={updateFormatContent}
          className="border-t border-border px-3 pb-4 pt-3 space-y-4"
        >
          <input type="hidden" name="slug" value={format.slug} />

          <div className="space-y-1">
            <label
              htmlFor={`summary-${format.slug}`}
              className="block font-sans text-xs font-medium text-text"
            >
              Kortsammendrag
            </label>
            <input
              id={`summary-${format.slug}`}
              type="text"
              name="rules_summary"
              defaultValue={format.rules_summary ?? ''}
              placeholder="Bruker standardteksten fra appen"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`points-${format.slug}`}
              className="block font-sans text-xs font-medium text-text"
            >
              Regelpoints{' '}
              <span className="font-normal text-muted">(én per linje)</span>
            </label>
            <textarea
              id={`points-${format.slug}`}
              name="rules_points"
              rows={4}
              defaultValue={pointsDefaultValue}
              placeholder="Bruker standardteksten fra appen"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 resize-y"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`long-${format.slug}`}
              className="block font-sans text-xs font-medium text-text"
            >
              Lang forklaring
            </label>
            <textarea
              id={`long-${format.slug}`}
              name="rules_long"
              rows={5}
              defaultValue={format.rules_long ?? ''}
              placeholder="Ingen lang forklaring ennå"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 resize-y"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor={`example-${format.slug}`}
              className="block font-sans text-xs font-medium text-text"
            >
              Konkret eksempel
            </label>
            <textarea
              id={`example-${format.slug}`}
              name="rules_example"
              rows={4}
              defaultValue={format.rules_example ?? ''}
              placeholder="Ingen eksempel ennå"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 resize-y"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-primary px-[18px] py-2.5 font-medium tracking-tight text-white transition-[background-color,transform,opacity] duration-100 hover:bg-primary-hover hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Lagre forklaring
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop matrix
// ---------------------------------------------------------------------------

function DesktopMatrix({
  formats,
  onVisibility,
  onPrimary,
  onActive,
  onCupEligible,
}: {
  formats: FormatWithMappings[];
  onVisibility: (slug: string, intent: MappingIntent, next: boolean) => void;
  onPrimary: (slug: string, intent: MappingIntent, next: boolean) => void;
  onActive: (slug: string, next: boolean) => void;
  onCupEligible: (slug: string, next: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-2">
          <tr className="text-left">
            <th className="px-3 py-2 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Format
            </th>
            <th className="px-3 py-2 font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Status
            </th>
            {MAPPING_INTENTS.map((intent) => (
              <th
                key={intent}
                className="px-3 py-2 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted"
              >
                {INTENT_LABELS[intent]}
              </th>
            ))}
            <th className="px-3 py-2 text-center font-sans text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Cup
            </th>
          </tr>
        </thead>
        <tbody>
          {formats.map((f) => {
            const inactive = !f.is_active;
            return (
              <tr
                key={f.slug}
                className={`border-t border-border ${
                  inactive ? 'opacity-60' : ''
                }`}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted">
                      {formatIconFor(f.icon_key, 20)}
                    </span>
                    <span className="font-serif text-text">{f.display_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <RowStatusChip
                    status={deriveStatus(f)}
                    onClick={() => onActive(f.slug, !f.is_active)}
                  />
                </td>
                {MAPPING_INTENTS.map((intent) => {
                  const mapping = f.mappings[intent];
                  const visible = mapping?.is_visible ?? false;
                  const primary = mapping?.is_primary ?? false;
                  return (
                    <td key={intent} className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`${f.display_name} ${INTENT_LABELS[intent]} synlig`}
                          checked={visible}
                          disabled={inactive}
                          onChange={(e) =>
                            onVisibility(f.slug, intent, e.target.checked)
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <button
                          type="button"
                          aria-label={`${f.display_name} ${INTENT_LABELS[intent]} primary`}
                          aria-pressed={primary}
                          disabled={inactive}
                          onClick={() => onPrimary(f.slug, intent, !primary)}
                          className={`text-base leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            primary ? 'text-accent' : 'text-muted hover:text-accent'
                          }`}
                        >
                          {primary ? '★' : '☆'}
                        </button>
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${f.display_name} cup-eligible`}
                    checked={f.is_cup_eligible}
                    disabled={inactive}
                    onChange={(e) => onCupEligible(f.slug, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                </td>
              </tr>
            );
          })}
          {formats.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-center text-xs text-muted">
                Ingen formats å vise.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
