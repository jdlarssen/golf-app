import { SmartLink } from '@/components/ui/SmartLink';
import { FlammeIcon } from '@/components/icons/Icons';

/**
 * Kompakt streak-chip for hjem-headeren (#1194) — vises ved siden av
 * HandicapChip KUN når en ukentlig streak er pågående (≥ MIN_STREAK_WEEKS).
 * Bevisst liten (flamme + tall) så headeren ikke blir trang på mobil; hele
 * betydningen ligger i `aria-label`. Champagne-accent (highlight-fargen) fordi
 * en streak nettopp er en highlight. Tap → historikken der hele serien vises.
 */
export function StreakChip({
  weeks,
  ariaLabel,
}: {
  weeks: number;
  ariaLabel: string;
}) {
  return (
    <SmartLink
      href="/profile/historikk"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-surface min-h-[44px] px-3 transition-colors hover:bg-primary-soft"
    >
      <FlammeIcon size={16} className="text-accent-text" />
      <span className="font-serif text-[15px] tabular-nums text-accent-text">
        {weeks}
      </span>
    </SmartLink>
  );
}
