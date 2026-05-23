type LedgerHeaderProps = {
  /** Kolonne-tittel til venstre (1fr-kolonnen), f.eks. «Spill» eller «Bane». */
  leftLabel: string;
  /** Kolonne-tittel til høyre (target-bredde-kolonnen), f.eks. «Status» eller «Tees». */
  rightLabel: string;
  /**
   * CSS grid-template-columns. Tre kolonner: hoved-tittel (1fr), target-bredde,
   * og chevron-spacer (14px). admin/games bruker 84px for status-pill,
   * admin/courses bruker 64px for tee-count.
   */
  gridTemplateColumns: string;
};

/**
 * Delt header for «ledger»-listene i admin (forest-stripe med champagne-kickers
 * over rad-listen). Brukes både av faktisk ledger og av tilhørende skeleton.
 */
export function LedgerHeader({
  leftLabel,
  rightLabel,
  gridTemplateColumns,
}: LedgerHeaderProps) {
  return (
    <div
      className="mt-4 grid items-center gap-2.5 rounded-t-[12px] px-3.5 py-2"
      style={{
        gridTemplateColumns,
        background: 'var(--surface-strong)',
        color: 'var(--bg-tint)',
      }}
    >
      <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent">
        {leftLabel}
      </span>
      <span className="text-right font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent">
        {rightLabel}
      </span>
      <span />
    </div>
  );
}
