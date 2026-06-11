import type { CSSProperties, JSX } from 'react';
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

const rightStyle: CSSProperties = {
  textAlign: 'right',
  lineHeight: 1.4,
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
  const { holeNumber, par, strokeIndex, parByGender, playerGender } = props;
  const t = useTranslations('holes.entry');
  const ts = useTranslations('scorecard');
  const showAside = parByGender ? hasParDifference(parByGender) : false;
  const tooltip = showAside
    ? ts('parAsideTooltip', { genders: formatOtherGendersPar(parByGender!, playerGender) })
    : '';
  return (
    <div style={containerStyle}>
      <div style={leftStyle}>
        <div style={kickerStyle}>{t('hullKicker')}</div>
        <div className="score-num" style={numberStyle}>{holeNumber}</div>
      </div>
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
