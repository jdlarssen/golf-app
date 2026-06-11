'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';

export interface BottomActionBarProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

const containerStyle: CSSProperties = {
  // Flush mot skjermkanten som den globale bunn-nav-en: bakgrunnen går helt
  // ned, og `env(safe-area-inset-bottom)` løfter knappen klar av iPhone
  // home-indicator-en. Hull-siden dropper sin egen `paddingBottom` så denne
  // baren eier bunn-klareringen alene.
  padding: '10px 16px calc(18px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--border)',
  background: 'var(--surface)',
};

function buttonStyle(disabled: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '15px 18px',
    border: 'none',
    borderRadius: 14,
    background: disabled ? 'var(--disabled-bg)' : 'var(--primary)',
    color: disabled ? 'var(--disabled-fg)' : 'var(--bg-tint)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: 15,
    letterSpacing: '0.005em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform 120ms, box-shadow 120ms',
    textDecoration: 'none',
    textAlign: 'center',
  };
}

export function BottomActionBar(props: BottomActionBarProps): JSX.Element {
  const { label, href, disabled = false } = props;
  const style = buttonStyle(disabled);

  if (disabled || !href) {
    return (
      <div style={containerStyle}>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          style={style}
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <SmartLink href={href} aria-label={label} style={style}>
        {label}
      </SmartLink>
    </div>
  );
}
