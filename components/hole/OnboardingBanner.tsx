'use client';

import type { CSSProperties, JSX } from 'react';

export interface OnboardingBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

const bannerStyle: CSSProperties = {
  margin: '14px 14px 0',
  padding: '10px 14px',
  background: 'var(--primary)',
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

const closeBtnStyle: CSSProperties = {
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
  if (!visible) return null;
  return (
    <div style={bannerStyle}>
      <div style={chipStyle} aria-hidden="true">
        ↓
      </div>
      <div>
        <b style={prefixStyle}>Prøv dette:</b>{' '}
        Trykk det øverste kortet for å sette par. Bruk + og − for å justere.
      </div>
      <div style={closeHitStyle}>
        <button
          type="button"
          aria-label="Lukk"
          onClick={onDismiss}
          style={closeBtnStyle}
        >
          ×
        </button>
      </div>
    </div>
  );
}
