'use client';

import { useTranslations } from 'next-intl';
import type { InboxFilter } from '@/lib/notifications/inboxSections';

const CHIP =
  'h-11 shrink-0 rounded-full px-3.5 text-[13px] font-semibold leading-[normal]';
const ON = 'border-0 bg-primary text-white dark:text-bg';
const OFF = 'border border-border bg-surface text-text';

/**
 * «Alle», «Krever handling · N» and «Venner» (#2263). Toggle buttons with
 * `aria-pressed` in a labelled group, as on the artboard. N counts rows in
 * KREVER HANDLING — a group is one row — and is left out at 0, where the chip
 * still works.
 */
export function InboxFilterChips({
  value,
  onChange,
  actionCount,
}: {
  value: InboxFilter;
  onChange: (next: InboxFilter) => void;
  actionCount: number;
}) {
  const t = useTranslations('inbox');
  const chips: { key: InboxFilter; label: string }[] = [
    { key: 'all', label: t('filters.all') },
    {
      key: 'action',
      label: actionCount > 0 ? t('filters.actionCount', { count: actionCount }) : t('filters.action'),
    },
    { key: 'friends', label: t('filters.friends') },
  ];
  return (
    <div
      role="group"
      aria-label={t('filters.label')}
      className="flex gap-2 overflow-x-auto px-4 pb-2.5 pt-1.5"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={value === chip.key}
          onClick={() => onChange(chip.key)}
          data-testid={`inbox-filter-${chip.key}`}
          className={`${CHIP} ${value === chip.key ? ON : OFF}`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
