'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
} from './actions';

type Props = {
  initialFormats: FormatWithMappings[];
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
  const t = useTranslations('admin.formats');
  const tModes = useTranslations('modes');
  const [, startTransition] = useTransition();
  const [optimisticFormats, addOptimistic] = useOptimistic(
    initialFormats,
    applyAction,
  );
  const [activeTab, setActiveTab] = useState<MappingIntent>('kompis');
  const [showInactive, setShowInactive] = useState<boolean>(false);

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
          {t('togglesHint')}
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('showInactive')}
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
              {t(`intentLabels.${intent}` as Parameters<typeof t>[0])}
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
                      {tModes(f.slug as Parameters<typeof tModes>[0])}
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
                    {t('visibleLabel')}
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
                    {t('primaryLabel')}
                  </label>
                </div>
              </li>
            );
          })}
        </ul>

        <details className="rounded-lg border border-border bg-surface" open>
          <summary className="cursor-pointer px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('cupEligibleHeading')}
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
                    {tModes(f.slug as Parameters<typeof tModes>[0])}
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
  const t = useTranslations('admin.formats');
  const tModes = useTranslations('modes');
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
                {t(`intentLabels.${intent}` as Parameters<typeof t>[0])}
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
            const name = tModes(f.slug as Parameters<typeof tModes>[0]);
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
                    <span className="font-serif text-text">{name}</span>
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
                  const intentLabel = t(`intentLabels.${intent}` as Parameters<typeof t>[0]);
                  return (
                    <td key={intent} className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`${name} ${intentLabel} synlig`}
                          checked={visible}
                          disabled={inactive}
                          onChange={(e) =>
                            onVisibility(f.slug, intent, e.target.checked)
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <button
                          type="button"
                          aria-label={`${name} ${intentLabel} primary`}
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
                    aria-label={`${name} cup-eligible`}
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
