'use client';

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface OnboardingBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

const bannerStyle: CSSProperties = {
  margin: '14px 14px 0',
  padding: '10px 14px',
  background: 'var(--surface-strong)',
  color: 'var(--bg-tint)',
  borderRadius: 12,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 12,
  lineHeight: 1.4,
  position: 'relative',
};

const chipStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'var(--accent)',
  color: 'var(--primary)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 12,
  flexShrink: 0,
};

const prefixStyle: CSSProperties = {
  fontWeight: 600,
  color: 'var(--accent)',
};

const closeHitStyle: CSSProperties = {
  position: 'absolute',
  top: -6,
  right: -4,
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// Knappens egen boks er ~16×22 (padding 4 + ×-glyfen på 14px/line-height 1).
// `.tap-extend` (#1356) henger en usynlig ::after utenfor den: 22 + 2×11 = 44
// høy, og 15px til hver side gir ≥44 bredt selv om glyfen er smal. Boksen,
// posisjonen og fokusringen står urørt. Utvidelsen lander bare på
// ikke-interaktive naboer — banner-teksten til venstre, sidemargen til høyre,
// banner-flaten under, og topp-margen (14px) over. Se app/globals.css.
const closeBtnStyle: CSSProperties = {
  ['--tap-extend' as string]: '-11px -15px',
  background: 'transparent',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 14,
  padding: 4,
  lineHeight: 1,
  cursor: 'pointer',
};

export function OnboardingBanner(
  props: OnboardingBannerProps,
): JSX.Element | null {
  const { visible, onDismiss } = props;
  const t = useTranslations('holes.onboarding');
  if (!visible) return null;
  return (
    // data-focus-surface="strong": banner-flaten er --surface-strong, som i lys
    // modus er samme farge som fokusringen. Attributtet bytter ringen til linen
    // for lukkeknappen under. Se app/globals.css. Knappens hit-area stikker
    // bevisst litt over banner-kanten (top: -6), så øverste ringstrek treffer
    // side-bakgrunnen — de tre andre sidene ligger på forest og bærer
    // markeringen. `.tap-extend` på knappen rører ikke denne geometrien:
    // ringen følger fortsatt knappens egen lille boks.
    <div style={bannerStyle} data-focus-surface="strong">
      <div style={chipStyle} aria-hidden="true">
        ↓
      </div>
      <div>
        <b style={prefixStyle}>{t('prefix')}</b>{' '}
        {t('text')}
      </div>
      <div style={closeHitStyle}>
        <button
          type="button"
          aria-label={t('closeAriaLabel')}
          onClick={onDismiss}
          className="tap-extend"
          style={closeBtnStyle}
        >
          ×
        </button>
      </div>
    </div>
  );
}
