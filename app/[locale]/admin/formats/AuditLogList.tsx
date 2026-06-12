'use client';

import { useTranslations } from 'next-intl';
import type { FormatAuditEntry } from '@/lib/formats/audit';

type Props = {
  entries: FormatAuditEntry[];
};

type FormatsT = ReturnType<typeof useTranslations<'admin.formats'>>;

function buildChangeLabel(t: FormatsT, entry: FormatAuditEntry): string {
  const intentSuffix = entry.intent ? `/${entry.intent}` : '';
  const after = entry.after;

  switch (entry.change_type) {
    case 'visibility': {
      const next = after.is_visible === true;
      const key = next ? 'auditLog.changeLabels.visibilityOn' : 'auditLog.changeLabels.visibilityOff';
      return `${entry.format_slug}${intentSuffix} → ${t(key as Parameters<typeof t>[0])}`;
    }
    case 'primary': {
      const next = after.is_primary === true;
      const key = next ? 'auditLog.changeLabels.primaryOn' : 'auditLog.changeLabels.primaryOff';
      return `${entry.format_slug}${intentSuffix} → ${t(key as Parameters<typeof t>[0])}`;
    }
    case 'cup_eligible': {
      const next = after.is_cup_eligible === true;
      const key = next ? 'auditLog.changeLabels.cupEligibleOn' : 'auditLog.changeLabels.cupEligibleOff';
      return `${entry.format_slug} → ${t(key as Parameters<typeof t>[0])}`;
    }
    case 'active': {
      const next = after.is_active === true;
      const key = next ? 'auditLog.changeLabels.activated' : 'auditLog.changeLabels.deactivated';
      return `${entry.format_slug} → ${t(key as Parameters<typeof t>[0])}`;
    }
    default:
      return `${entry.format_slug} → endret`;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const mo = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}.${mo} ${hh}:${mm}`;
}

/**
 * Append-only liste over siste 50 format-mapping-endringer. Server-component
 * fetches via `getFormatMappingAudit` og passerer som prop. Mobil viser
 * accordion (lukket default), desktop viser åpen seksjon.
 */
export function AuditLogList({ entries }: Props) {
  const t = useTranslations('admin.formats');

  if (entries.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-xs text-muted">
        {t('auditLog.emptyState')}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {t('auditLog.heading', { n: entries.length })}
      </h2>
      <details className="rounded-lg border border-border bg-surface md:open" open>
        <summary className="cursor-pointer px-3 py-2 text-sm md:hidden">
          {t('auditLog.summaryLabel', { n: entries.length })}
        </summary>
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[88px_1fr_auto] items-baseline gap-2 px-3 py-2 text-xs"
            >
              <span className="font-mono tabular-nums text-muted">
                {formatTime(e.created_at)}
              </span>
              <span className="text-text">
                <span className="font-semibold">{e.actor_name}</span>{' '}
                {buildChangeLabel(t, e)}
              </span>
              <span className="text-muted">{e.change_type}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
