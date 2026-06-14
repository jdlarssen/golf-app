import { ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info' | 'warning';

const tones: Record<Tone, string> = {
  success: 'bg-primary-soft border-success/40 text-success',
  error: 'bg-danger/[0.08] border-danger/30 text-danger',
  info: 'bg-accent/[0.10] border-accent/40 text-text',
  warning: 'bg-warning/[0.10] border-warning/40 text-warning',
};

export function Banner({
  tone,
  children,
  testId,
}: {
  tone: Tone;
  children: ReactNode;
  /** Optional stable hook for E2E locators, so specs don't lock Norwegian copy. */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`border rounded-xl px-4 py-3 text-sm font-medium tracking-tight ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
