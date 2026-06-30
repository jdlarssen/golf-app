'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';

export interface BottomActionBarProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

// En innrammet, avgrenset knapp: fullt avrundet og insett fra skjermkantene med
// side- og bunn-margin. Page-bakgrunnen (`--bg`) fyller sonen rundt og under
// knappen, så `env(safe-area-inset-bottom)` (home-indikatoren) ligger på
// bakgrunnen — ikke på den grønne knappeflaten. `box-sizing: border-box` så
// paddingen ikke overflyter den insette bredden; `margin: 0 auto` sentrerer
// blokken (virker likt for både <button> og <a>, der `width: auto` ellers
// krymper en <button> til innholdet).
function barStyle(disabled: boolean): CSSProperties {
  return {
    display: 'block',
    width: 'calc(100% - 32px)',
    boxSizing: 'border-box',
    marginTop: 12,
    marginLeft: 'auto',
    marginRight: 'auto',
    marginBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    padding: '17px 18px',
    border: 'none',
    borderRadius: 16,
    background: disabled ? 'var(--disabled-bg)' : 'var(--primary)',
    color: disabled ? 'var(--disabled-fg)' : 'var(--bg-tint)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: 15,
    letterSpacing: '0.005em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none',
    textAlign: 'center',
  };
}

export function BottomActionBar(props: BottomActionBarProps): JSX.Element {
  const { label, href, disabled = false } = props;
  const style = barStyle(disabled);

  if (disabled || !href) {
    return (
      <button type="button" disabled={disabled} aria-label={label} style={style}>
        {label}
      </button>
    );
  }

  return (
    <SmartLink href={href} aria-label={label} style={style}>
      {label}
    </SmartLink>
  );
}
