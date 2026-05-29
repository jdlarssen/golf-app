import { MODE_LABELS, type GameMode, type GameModeConfig } from '@/lib/scoring/modes/types';
import { MODE_GUIDE, resolveModeGuide } from '@/lib/formats/modeGuide';
import { formatDisplayLabel } from '@/lib/games/formatLabel';

/**
 * Gjenbrukbar utvidbar modus-forklaring (#299). Viser modus-navn + ett-linjes
 * sammendrag alltid, og folder ut «korte regler» når spilleren trykker.
 *
 * Bygd på native `<details>`/`<summary>`: server-renderbart (ingen client-
 * bundle), tastatur-tilgjengelig og reduced-motion-trygt uten JS-animasjon.
 * `<details>`-disclosure er ren info, ikke en destruktiv handling — så
 * dedikert-side-konvensjonen for destruktive flyter gjelder ikke her.
 *
 * To hjem: et SPILLFORM-kort på spillerens game-side, og hver rad i
 * oppslagsverket `/spillformer`.
 */
export function ModeGuideCard({
  mode,
  modeConfig,
  className,
}: {
  mode: GameMode;
  /**
   * Valgfri mode-config. Når satt brukes den til å vise variant-bevisst navn
   * og guide — særlig 4BBB Stableford (team_size 2) som ellers ville arvet
   * solo-Stableford-teksten siden de deler game_mode (#282). Uten prop:
   * dagens game_mode-baserte oppførsel uendret.
   */
  modeConfig?: GameModeConfig;
  className?: string;
}) {
  const label = modeConfig
    ? formatDisplayLabel(mode, modeConfig)
    : (MODE_LABELS[mode] ?? mode);
  const guide = modeConfig
    ? resolveModeGuide(mode, modeConfig.team_size)
    : MODE_GUIDE[mode];

  // Defensivt: en gammel/legacy game_mode uten guide-entry skal ikke krasje.
  // Vis i det minste modus-navnet.
  if (!guide) {
    return (
      <div
        data-testid="mode-guide"
        className={`rounded-2xl border border-border bg-surface px-4 py-3 ${className ?? ''}`}
      >
        <p className="font-serif text-[17px] font-medium text-text">{label}</p>
      </div>
    );
  }

  return (
    <details
      data-testid="mode-guide"
      data-mode={mode}
      className={`group rounded-2xl border border-border bg-surface ${className ?? ''}`}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="font-serif text-[17px] font-medium tracking-[-0.01em] text-text">
            {label}
          </p>
          <p className="mt-1 text-sm text-muted">{guide.summary}</p>
          <span className="mt-2 inline-block text-xs font-medium text-primary">
            Slik funker det
            <span
              aria-hidden
              className="ml-1 inline-block transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            >
              ⌄
            </span>
          </span>
        </div>
      </summary>
      <ul className="mt-1 space-y-2 border-t border-border px-4 pb-4 pt-3 text-sm text-text">
        {guide.points.map((point) => (
          <li key={point} className="flex gap-2">
            <span aria-hidden className="mt-[2px] text-primary">
              ›
            </span>
            <span className="min-w-0 flex-1">{point}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
