import { ReactNode } from 'react';

type Tone = 'success' | 'error' | 'info';

const tones: Record<Tone, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-700',
  info: 'bg-blue-50 border-blue-200 text-blue-700',
};

export function Banner({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
