import { SmartLink } from '@/components/ui/SmartLink';
import { FormatStyleBadge } from '@/components/ui/FormatStyleBadge';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Gjenbrukbar utvidbar modus-forklaring (#299, #307). Viser modus-navn +
 * ett-linjes sammendrag alltid, og folder ut «korte regler» når spilleren
 * trykker. Valgfri `detailHref` legger til en «Les mer →»-lenke til
 * detaljsiden for modus-en (#308).
 *
 * Ren presentasjonskomponent — caller henter merged content via
 * `mergeModeContent()` + `getModeContentMap()` server-side og sender inn
 * summary/points/label som props. Ingen intern MODE_GUIDE-import.
 *
 * Bygd på native `<details>`/`<summary>`: server-renderbart (ingen client-
 * bundle), tastatur-tilgjengelig og reduced-motion-trygt uten JS-animasjon.
 * `<details>`-disclosure er ren info, ikke en destruktiv handling — så
 * dedikert-side-konvensjonen for destruktive flyter gjelder ikke her.
 *
 * To hjem: et SPILLFORM-kort på spillerens game-side, og hver rad i
 * oppslagsverket `/spillformater`.
 */
export function ModeGuideCard({
  summary,
  points,
  label,
  detailHref,
  mode,
  playStyleTeamSize,
  className,
  id,
}: {
  /** Sammendrag-setning — alltid synlig i lukket tilstand. */
  summary: string;
  /** 2–4 korte forklaringspunkter, vises i åpen tilstand. */
  points: string[];
  /** Modus-navn (norsk), vises øverst i kortet. */
  label: string;
  /**
   * Valgfri href til detalj-side for modus-en. Når satt rendres en
   * «Les mer →»-lenke nederst i åpen tilstand.
   */
  detailHref?: string;
  /**
   * Valgfri spillmodus — når satt vises et spillestil-merke (Solo / Lag) ved
   * siden av navnet (#478/#498). Brukt på /spillformater; game-side-
   * kortet utelater den (formatet er allerede valgt).
   */
  mode?: GameMode;
  /** Valgfri lagstørrelse som låser et fleksibelt format-merke til Solo/Lag. */
  playStyleTeamSize?: number;
  className?: string;
  /** Valgfri element-id — lar et ark scrolle til et bestemt format (#498). */
  id?: string;
}) {
  return (
    <details
      id={id}
      data-testid="mode-guide"
      className={`group rounded-2xl border border-border bg-surface ${className ?? ''}`}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-serif text-[17px] font-medium tracking-[-0.01em] text-text">
              {label}
            </p>
            {mode && (
              <FormatStyleBadge mode={mode} teamSize={playStyleTeamSize} />
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{summary}</p>
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
      <ul className="mt-1 space-y-2 border-t border-border px-4 pb-3 pt-3 text-sm text-text">
        {points.map((point) => (
          <li key={point} className="flex gap-2">
            <span aria-hidden className="mt-[2px] text-primary">
              ›
            </span>
            <span className="min-w-0 flex-1">{point}</span>
          </li>
        ))}
      </ul>
      {detailHref && (
        <div className="border-t border-border px-4 pb-3 pt-2">
          <SmartLink
            href={detailHref}
            className="text-xs font-medium text-primary hover:underline"
          >
            Les mer →
          </SmartLink>
        </div>
      )}
    </details>
  );
}
