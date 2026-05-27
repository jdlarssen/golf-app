/**
 * Liten hint-banner som vises nederst i wizard step 2 (Format-velgeren) for
 * alle intents. Signaliserer at sideturneringer kommer som eget steg i Klar-
 * disclosure-en — admin trenger ikke bekymre seg for det her.
 */
export function SideTournamentsBanner() {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
      <p>
        <span aria-hidden className="mr-1">
          💡
        </span>
        Sideturneringer (longest drive, closest-to-pin) kan legges på i Klar-
        steget.
      </p>
    </div>
  );
}
