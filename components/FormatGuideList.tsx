import { ModeGuideCard } from '@/components/ModeGuideCard';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Én serialiserbar rad i format-oppslagsverket. Bygges server-side av
 * `getFormatGuideEntries` (lib/formats/buildFormatGuide) og sendes som plain
 * data — så lista kan rendres både på server-siden /spillformater og inne i
 * det klient-rendrede «?»-arket i veiviseren uten ekstra fetch eller
 * server-only-import (#498).
 */
export type FormatGuideEntry = {
  key: string;
  mode: GameMode;
  label: string;
  summary: string;
  points: string[];
  /** Lagstørrelse for variant-bevisste chips (4BBB → «Lag»). */
  playStyleTeamSize?: number;
};

/**
 * Delt format-guide-liste (#498). Brukes av oppslagssiden /spillformater
 * (`withDetailLinks`) og av «?»-arket i veiviseren (uten «Les mer →», med
 * `cardIdPrefix` så arket kan scrolle til et bestemt format).
 *
 * Ren presentasjon — ingen server-only-import, så den kan også havne i
 * klient-bundlen via arket. `ModeGuideCard` er native `<details>`, så ingen
 * client-state trengs her.
 */
export type CardLabels = {
  showRules: string;
  hideRules: string;
  readMore: string;
};

export function FormatGuideList({
  entries,
  withDetailLinks = true,
  routeBase = '/spillformater',
  cardIdPrefix,
  className,
  cardLabels,
}: {
  entries: FormatGuideEntry[];
  /** Vis «Les mer →»-lenke til detaljsiden. Arket setter dette false. */
  withDetailLinks?: boolean;
  /** Rute-prefiks for detalj-lenkene. */
  routeBase?: string;
  /** Når satt får hvert kort id `${cardIdPrefix}${key}` for scroll-to. */
  cardIdPrefix?: string;
  className?: string;
  /**
   * Oversatte kontroll-strenger for kortene. Sendes inn fra server- eller
   * klient-caller slik at ModeGuideCard ikke trenger eigen i18n-import (#760).
   * Utelates ved bruk i «?»-arket (klienten bruker egne useTranslations).
   */
  cardLabels?: CardLabels;
}) {
  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      {entries.map((entry) => (
        <ModeGuideCard
          key={entry.key}
          id={cardIdPrefix ? `${cardIdPrefix}${entry.key}` : undefined}
          label={entry.label}
          summary={entry.summary}
          points={entry.points}
          detailHref={withDetailLinks ? `${routeBase}/${entry.mode}` : undefined}
          mode={entry.mode}
          playStyleTeamSize={entry.playStyleTeamSize}
          showRulesLabel={cardLabels?.showRules}
          hideRulesLabel={cardLabels?.hideRules}
          readMoreLabel={cardLabels?.readMore}
        />
      ))}
    </div>
  );
}
