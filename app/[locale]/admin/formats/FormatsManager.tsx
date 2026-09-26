'use client';

import { useId, useOptimistic, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  MAPPING_INTENTS,
  type FormatWithMappings,
  type MappingIntent,
} from '@/lib/formats/types';
import { formatIconFor } from '@/lib/formats/icons';
import { useRovingFocus } from '@/hooks/useRovingFocus';
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
  // Mobile intent tabs follow the tablist keyboard pattern: one tab stop,
  // arrow keys switch tab; each tab points at the format list below.
  const tabsBaseId = useId();
  const tabId = (intent: MappingIntent) => `${tabsBaseId}-tab-${intent}`;
  const panelId = `${tabsBaseId}-panel`;
  const rovingProps = useRovingFocus(MAPPING_INTENTS, activeTab, setActiveTab);
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
        <label className="tap-extend inline-flex cursor-pointer items-center gap-2 text-xs text-muted [--tap-extend:-14px_-6px]">
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
              className={`tap-extend rounded-md border px-3 py-2 text-sm font-medium transition-colors [--tap-extend:-4px_0] ${
                activeTab === intent
                  ? 'border-primary bg-primary-soft text-text'
                  : 'border-border bg-surface text-text'
              }`}
            >
              {t(`intentLabels.${intent}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(activeTab)}>
          <ul className="space-y-2">
            {visibleFormats.map((f) => {
              const mapping = f.mappings[activeTab];
              const visible = mapping?.is_visible ?? false;
              const primary = mapping?.is_primary ?? false;
              const name = tModes(f.slug as Parameters<typeof tModes>[0]);
              const intentLabel = t(`intentLabels.${activeTab}` as Parameters<typeof t>[0]);
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
                      <span className="font-serif text-sm text-text">{name}</span>
                    </div>
                    <RowStatusChip
                      status={deriveStatus(f)}
                      formatName={name}
                      onClick={() => handleActiveToggle(f.slug, !f.is_active)}
                    />
                  </div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <label className="tap-extend inline-flex cursor-pointer items-center gap-2 [--tap-extend:-12px_-8px]">
                      <input
                        type="checkbox"
                        aria-label={t('visibleAria', { format: name, intent: intentLabel })}
                        checked={visible}
                        disabled={!f.is_active}
                        onChange={(e) =>
                          handleVisibilityToggle(f.slug, activeTab, e.target.checked)
                        }
                        className="h-4 w-4 accent-primary"
                      />
                      {t('visibleLabel')}
                    </label>
                    <label className="tap-extend inline-flex cursor-pointer items-center gap-2 [--tap-extend:-12px_-8px]">
                      <input
                        type="checkbox"
                        aria-label={t('primaryAria', { format: name, intent: intentLabel })}
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
        </div>

        <details className="rounded-lg border border-border bg-surface" open>
          <summary className="tap-extend cursor-pointer px-3 py-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted [--tap-extend:-6px_0]">
            {t('cupEligibleHeading')}
          </summary>
          <ul className="border-t border-border">
            {cupFormats.map((f) => {
              const name = tModes(f.slug as Parameters<typeof tModes>[0]);
              return (
                <li
                  key={f.slug}
                  className={`flex items-center justify-between gap-3 px-3 py-2 ${
                    f.is_active ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted">{formatIconFor(f.icon_key, 20)}</span>
                    <span className="font-serif text-sm text-text">{name}</span>
                  </div>
                  <label className="tap-extend inline-flex cursor-pointer items-center gap-2 [--tap-extend:-10px_-12px]">
                    <input
                      type="checkbox"
                      aria-label={t('cupEligibleAria', { format: name })}
                      checked={f.is_cup_eligible}
                      disabled={!f.is_active}
                      onChange={(e) =>
                        handleCupEligibleToggle(f.slug, e.target.checked)
                      }
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </li>
              );
            })}
            {cupFormats.length === 0 && (
              <li className="px-3 py-3 text-xs text-muted">
                {t('cupEligibleEmpty')}
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
                    formatName={name}
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
                          aria-label={t('visibleAria', { format: name, intent: intentLabel })}
                          checked={visible}
                          disabled={inactive}
                          onChange={(e) =>
                            onVisibility(f.slug, intent, e.target.checked)
                          }
                          className="h-4 w-4 accent-primary"
                        />
                        <button
                          type="button"
                          aria-label={t('primaryAria', { format: name, intent: intentLabel })}
                          aria-pressed={primary}
                          disabled={inactive}
                          onClick={() => onPrimary(f.slug, intent, !primary)}
                          className={`text-base leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            // Interaktiv kontroll → WCAG 1.4.11 krever ≥3:1;
                            // --accent er ~2,1:1 mot lys flate, accent-text
                            // klarerer i begge temaer (#1733).
                            primary ? 'text-accent-text' : 'text-muted hover:text-accent-text'
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
                    aria-label={t('cupEligibleAria', { format: name })}
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
                {t('matrixEmpty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
