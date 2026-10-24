import type { PlayedByEntry, RoundPlayedBy } from '@/lib/league/roundPlayedBy';

export type RoundPlayedByLabels = {
  delivered: string;
  inProgress: string;
  missing: string;
  /** The viewer's own entry («deg»). */
  you: string;
  unknownPlayer: string;
};

/**
 * «Har spilt / I gang / Mangler» under an open round (#2638, artboard 7a).
 * An empty group is left out. The viewer is written as «deg», in bold.
 */
export function RoundPlayedByList({
  groups,
  labels,
}: {
  groups: RoundPlayedBy;
  labels: RoundPlayedByLabels;
}) {
  const rows: Array<{ key: keyof RoundPlayedBy; label: string }> = [
    { key: 'delivered', label: labels.delivered },
    { key: 'inProgress', label: labels.inProgress },
    { key: 'missing', label: labels.missing },
  ];
  const visible = rows.filter((r) => groups[r.key].length > 0);
  if (visible.length === 0) return null;

  const nameOf = (p: PlayedByEntry) => p.name ?? labels.unknownPlayer;

  return (
    <dl className="mt-4 pt-4 border-t border-border space-y-1.5" data-testid="liga-round-played-by">
      {visible.map((row) => (
        <div key={row.key} className="flex items-baseline gap-3" data-testid={`liga-played-by-${row.key}`}>
          <dt className="w-[72px] shrink-0 font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted">
            {row.label}
          </dt>
          <dd className="font-sans text-[13px] leading-[19.5px] text-text">
            {groups[row.key].map((p, i) => (
              <span key={p.userId}>
                {i > 0 && ', '}
                {p.isViewer ? <b className="font-semibold">{labels.you}</b> : nameOf(p)}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}
