'use client';

// Putt-registrering-bryter (#939) som pille, rutet inn i hull-headeren via
// HoleHero sin puttsToggle-slot (rett til venstre for Par). Sitter i den ledige
// header-høyden, så den tar ingen egen vertikal plass. «På» bruker en myk
// primary-tint (champagne er reservert vinnere) + fyllt pille; «av» er en
// dempet omriss-pille. Kun fangst-format viser den.

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { PinFlagSm } from '@/components/icons';

export function PuttsTogglePill({
  capturesPutts,
  enabled,
  disabled,
  onToggle,
}: {
  /** Kun individuelle slag-/stableford-format viser bryteren. */
  capturesPutts: boolean;
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element | null {
  const t = useTranslations('holes');
  if (!capturesPutts) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={t('putts.toggleLabel')}
      onClick={onToggle}
      disabled={disabled}
      style={{
        // #1796: den visuelle pillen er ~27px høy — under stilguidens
        // 44px-minimum. Selve knappen er en usynlig, større trykkflate:
        // padding utvider hit-arealet til ≥44px høyde, negativ margin
        // speiler paddingen så pillen beholder eksakt plassering og
        // størrelse i header-raden (#939-designet består).
        display: 'inline-flex',
        alignItems: 'center',
        background: 'transparent',
        border: 'none',
        padding: '9px 6px',
        margin: '-9px -6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 999,
          border: `1px solid ${
            enabled
              ? 'color-mix(in srgb, var(--primary) 50%, transparent)'
              : 'var(--border)'
          }`,
          background: enabled
            ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
            : 'transparent',
          color: enabled ? 'var(--text)' : 'var(--text-muted)',
          fontFamily: 'var(--font-sans)',
          fontSize: 12.5,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <PinFlagSm size={13} />
        <span>{t('putts.fieldLabel')}</span>
      </span>
    </button>
  );
}
