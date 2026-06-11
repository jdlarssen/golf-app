import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface SyncStatusLineProps {
  syncing: boolean;
  savedAt: string;
}

const containerStyle: CSSProperties = {
  marginTop: 6,
  fontSize: 11.5,
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 4px 0',
};

const dotBaseStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  display: 'inline-block',
  transition: 'background 200ms',
};

export function SyncStatusLine(props: SyncStatusLineProps): JSX.Element {
  const { syncing, savedAt } = props;
  const t = useTranslations('holes.sync');
  const dotStyle: CSSProperties = {
    ...dotBaseStyle,
    background: syncing ? 'var(--warning)' : 'var(--success)',
  };
  let text: string;
  if (syncing) {
    text = t('sending');
  } else if (savedAt.length > 0) {
    text = t('savedAt', { time: savedAt });
  } else {
    text = t('savedRecently');
  }
  return (
    <div style={containerStyle}>
      <span data-testid="sync-dot" style={dotStyle} />
      <span>{text}</span>
    </div>
  );
}
