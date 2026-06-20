import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';

export interface SyncStatusLineProps {
  syncing: boolean;
  savedAt: string;
  /** Unsynced queue items waiting for network. 0/undefined = nothing waiting. */
  pendingCount?: number;
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
  const { syncing, savedAt, pendingCount } = props;
  const t = useTranslations('holes.sync');

  let dotColor: string;
  let text: string;

  if (syncing) {
    // Locked state 1: actively writing to local DB
    dotColor = 'var(--warning)';
    text = t('sending');
  } else if ((pendingCount ?? 0) > 0) {
    // State 2 (new): items in queue, waiting for network
    dotColor = 'var(--warning)';
    text = t('waitingForNetwork');
  } else if (savedAt.length > 0) {
    // Locked state 3: confirmed save with timestamp
    dotColor = 'var(--success)';
    text = t('savedAt', { time: savedAt });
  } else {
    // Locked state 4: fallback (no timestamp yet)
    dotColor = 'var(--success)';
    text = t('savedRecently');
  }

  const dotStyle: CSSProperties = {
    ...dotBaseStyle,
    background: dotColor,
  };

  return (
    <div style={containerStyle}>
      <span data-testid="sync-dot" style={dotStyle} />
      <span>{text}</span>
    </div>
  );
}
