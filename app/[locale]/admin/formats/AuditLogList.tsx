import type { FormatAuditEntry } from '@/lib/formats/audit';

type Props = {
  entries: FormatAuditEntry[];
};

function formatChangeLabel(entry: FormatAuditEntry): string {
  const intentSuffix = entry.intent ? `/${entry.intent}` : '';
  const before = entry.before;
  const after = entry.after;

  switch (entry.change_type) {
    case 'visibility': {
      const next = after.is_visible === true;
      return `${entry.format_slug}${intentSuffix} → synlig ${next ? 'på' : 'av'}`;
    }
    case 'primary': {
      const next = after.is_primary === true;
      return `${entry.format_slug}${intentSuffix} → primary ${next ? 'på' : 'av'}`;
    }
    case 'cup_eligible': {
      const next = after.is_cup_eligible === true;
      return `${entry.format_slug} → cup-eligible ${next ? 'på' : 'av'}`;
    }
    case 'active': {
      const next = after.is_active === true;
      return `${entry.format_slug} → ${next ? 'aktivert' : 'deaktivert'}`;
    }
    default:
      return `${entry.format_slug} → endret`;
  }
  // Unused helper-paths beholdt enkle med eksplisitt switch så fremtidig
  // change_type-utvidelse blokkerer ikke type-sjekken.
  void before;
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
  if (entries.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface px-3 py-4 text-center text-xs text-muted">
        Ingen endringer logget ennå.
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Endringslogg (siste {entries.length})
      </h2>
      <details className="rounded-lg border border-border bg-surface md:open" open>
        <summary className="cursor-pointer px-3 py-2 text-sm md:hidden">
          Vis endringslogg ({entries.length} entries)
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
                {formatChangeLabel(e)}
              </span>
              <span className="text-muted">{e.change_type}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
