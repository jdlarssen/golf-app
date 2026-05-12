'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';

export interface BottomActionBarProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

const containerStyle: CSSProperties = {
  padding: '10px 16px 18px',
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
    background: disabled ? '#D9D2C0' : 'var(--primary)',
    color: disabled ? '#9A8F7C' : '#F8F6F0',
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
