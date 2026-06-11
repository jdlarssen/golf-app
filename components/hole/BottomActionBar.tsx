'use client';

import { SmartLink } from '@/components/ui/SmartLink';
import type { CSSProperties, JSX } from 'react';

export interface BottomActionBarProps {
  label: string;
  href?: string;
  disabled?: boolean;
}

// Knappen ER bunn-baren: full bredde, kant-til-kant, avrundet topp og flush
// bunn. Knappens egen farge fyller `env(safe-area-inset-bottom)` helt ned til
// skjermkanten, så det nederste på skjermen er selve knappen — ingen
// `--surface`-stripe under den. Hull-siden dropper sin `paddingBottom` så
// baren eier bunn-klareringen alene.
function barStyle(disabled: boolean): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '17px 18px calc(17px + env(safe-area-inset-bottom, 0px))',
    border: 'none',
    borderRadius: '18px 18px 0 0',
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
