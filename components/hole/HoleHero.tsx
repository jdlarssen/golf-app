import type { CSSProperties, JSX, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  hasParDifference,
  formatOtherGendersPar,
  type HoleParByGender,
} from '@/lib/games/parDisplay';
import type { ScoringGender } from '@/lib/scoring/modes/types';

export interface HoleHeroProps {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /**
   * Valgfri per-kjønn-par for hullet. Når hullet har avvik mellom kjønn
   * (`hasParDifference`) vises en liten asterisk-indikator etter par-tallet.
   * Title-attributtet på asterisken forklarer hva medspillere av andre kjønn
   * ser. #240.
   */
  parByGender?: HoleParByGender;
  /**
   * Spillerens egen tee-gender. Brukes til å ekskludere egen kjønn fra
   * tooltip-teksten. Default `'mens'` når undefined. #240.
   */
  playerGender?: ScoringGender;
  /**
   * Valgfri modus-kontekst-linje (Round Robin segment-konstellasjon, Wolf-valg,
   * Florida step-aside, Skins-pott) plassert i midt-kolonnen mellom hull-nummeret
   * og Par/indeks. Den tucker teksten inn i den ledige høyden ved siden av det
   * 44px store hull-tallet, så banneret ikke tar en egen full-bredde rad og dytter
   * 4. spillerkort under folden. Undefined for modi uten kontekst. #639.
   */
  contextLine?: ReactNode;
  /**
   * Valgfri «Registrer putter»-bryter (#939) plassert helt til høyre, rett til
   * venstre for Par/indeks. Sitter i den ledige høyden i header-raden, så den
   * tar ingen egen vertikal plass. Kun satt for individuelle slag-/stableford-
   * format (de eneste som fanger putter, og som aldri har en `contextLine`).
   */
  puttsToggle?: ReactNode;
  /**
   * Valgfritt totalt antall hull i runden. Når satt vises en liten, muted
   * «av {total}»-suffiks rett etter det store hull-tallet — synlig fremdrift i
   * runden (goal-gradient, #1172). Tucket inn i venstre-kolonnens baseline så
   * indikatoren ikke tar en egen full-bredde rad (respekterer #639/#939-
   * plasskampen). `TOTAL_HOLES` (18) er single source of truth for verdien.
   */
  totalHoles?: number;
}

const containerStyle: CSSProperties = {
  padding: '10px 24px 12px',
  borderBottom: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const leftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexShrink: 0,
};

// Midt-kolonne for modus-kontekst-linja (#639). flex:1 + minWidth:0 lar den
// fylle plassen mellom hull-tallet og Par/indeks og wrappe innenfor tall-høyden.
const centerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  alignSelf: 'center',
  padding: '0 12px',
};

const kickerStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
};

const numberStyle: CSSProperties = {
  fontSize: 44,
  letterSpacing: '-0.03em',
  lineHeight: 1,
  color: 'var(--text)',
};

// Grupperer hull-tallet + «av {total}»-suffikset (#1172) med en tettere gap enn
// leftStyle-en, så suffikset legger seg tett på grunnlinja rett etter tallet.
const numberGroupStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 5,
};

const totalSuffixStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  fontWeight: 500,
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

const rightStyle: CSSProperties = {
  textAlign: 'right',
  lineHeight: 1.4,
  flexShrink: 0,
};

const parStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 20,
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
};

const indexStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
  color: 'var(--text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

export function HoleHero(props: HoleHeroProps): JSX.Element {
  const { holeNumber, par, strokeIndex, parByGender, playerGender, contextLine, puttsToggle, totalHoles } = props;
  const t = useTranslations('holes.entry');
  const ts = useTranslations('scorecard');
  const showAside = parByGender ? hasParDifference(parByGender) : false;
  const tooltip = showAside
    ? ts('parAsideTooltip', {
        genders: formatOtherGendersPar(parByGender!, playerGender, {
          mens: ts('parGenderMens', { par: parByGender!.mens }),
          ladies: ts('parGenderLadies', { par: parByGender!.ladies }),
          juniors: ts('parGenderJuniors', { par: parByGender!.juniors }),
        }),
      })
    : '';
  return (
    <div style={containerStyle}>
      <div style={leftStyle}>
        <div style={kickerStyle}>{t('hullKicker')}</div>
        <div style={numberGroupStyle}>
          <div className="score-num" style={numberStyle}>{holeNumber}</div>
          {totalHoles != null && (
            <div style={totalSuffixStyle}>{t('hullTotalSuffix', { total: totalHoles })}</div>
          )}
        </div>
      </div>
      {contextLine && <div style={centerStyle}>{contextLine}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {puttsToggle}
        <div style={rightStyle}>
          <div style={parStyle}>
            {t('hullPar', { par })}
            {showAside && (
              <ParAsideMarker tooltip={tooltip} />
            )}
          </div>
          <div style={indexStyle}>{t('hullIndex', { si: strokeIndex })}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Liten superskript-asterisk som signaliserer at hullet har avvikende par
 * for medspillere av andre kjønn. Title-attributtet gir tooltip på desktop;
 * long-press fanger det opp på iOS. Statisk (ingen state) — vi unngår å
 * legge til klikkbar popover for v1. #240.
 */
function ParAsideMarker({ tooltip }: { tooltip: string }): JSX.Element {
  return (
    <sup
      data-testid="par-aside-marker"
      title={tooltip}
      aria-label={tooltip}
      style={{
        marginLeft: 2,
        fontSize: '0.55em',
        fontWeight: 600,
        color: 'var(--text-muted)',
        cursor: 'help',
      }}
    >
      *
    </sup>
  );
}
