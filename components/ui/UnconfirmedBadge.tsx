/**
 * Liten, dempet pille som vises ved siden av et spillernavn når
 * `accepted_at === null` (spilleren er lagt til av en arrangør, men
 * har ikke bekreftet deltakelse selv). Bevisst lavmælt — det er en
 * informativ merkelapp, ikke en advarsel. Speiler ModeChip-stilen:
 * border + transparent bg, muted-farge, ingen uppercase.
 *
 * Brukes i game-hjem-roster, admin-spill-detalj, admin-spillerstatus
 * og liga-deltakerliste. Rendres KUN der `accepted_at == null`; caller
 * er ansvarlig for den betingelsen.
 *
 * #463 — «Ikke bekreftet»-merkelapp.
 */
export function UnconfirmedBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="unconfirmed-badge"
      className={`inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
      }}
    >
      Ikke bekreftet
    </span>
  );
}
