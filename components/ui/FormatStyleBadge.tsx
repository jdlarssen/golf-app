import {
  formatPlayStyle,
  PLAY_STYLE_LABELS,
  type GameMode,
} from '@/lib/scoring/modes/types';

/**
 * Lite merke som forteller hvordan et format spilles — Solo / Hver for seg /
 * Lag / Solo eller lag (#478). Vises på format-kortene i veiviseren og på
 * /spillformer så man ser med en gang om man spiller alene, hver for seg eller
 * på lag.
 *
 * Bevisst lavmælt, samme visuelle språk som `ModeChip`: border + transparent
 * bg, sans 9.5px, ikke uppercase. Spillestil er metadata om formatet, ikke en
 * status som krever oppmerksomhet.
 */
export function FormatStyleBadge({
  mode,
  teamSize,
  className,
}: {
  mode: GameMode;
  /**
   * Valgfri lagstørrelse for å låse et fleksibelt format (stableford-familien)
   * til en konkret stil: ≥2 → «Lag», 1 → «Solo». Brukes på /spillformer der
   * 4BBB-varianten har et eget kort. Utelatt (veiviseren) → fleksible format
   * viser «Solo eller lag» fordi lagstørrelse ikke er valgt ennå.
   */
  teamSize?: number;
  className?: string;
}) {
  const base = formatPlayStyle(mode);
  const style =
    base === 'flexible' && teamSize !== undefined
      ? teamSize >= 2
        ? 'team'
        : 'solo'
      : base;
  // Defensivt: en ukjent slug (f.eks. et nytt format seedet før koden er
  // deployet) faller gjennom til en ukjent stil uten label — vis da ingenting
  // i stedet for et tomt merke.
  const label = PLAY_STYLE_LABELS[style];
  if (!label) return null;
  return (
    <span
      className={`inline-block rounded-full border px-[7px] py-[2px] font-sans text-[9.5px] font-medium leading-none ${className ?? ''}`}
      style={{
        borderColor: 'var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
  );
}
