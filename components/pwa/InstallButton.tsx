'use client';

import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { Card } from '@/components/ui/Card';
import { InstallInstructionsModal } from './InstallInstructionsModal';

export function InstallButton() {
  const { status, install } = useInstallPrompt();
  const [modalOpen, setModalOpen] = useState(false);

  if (status === 'loading' || status === 'standalone') return null;

  async function onClick() {
    if (status === 'native') {
      await install();
    } else {
      setModalOpen(true);
    }
  }

  const modalVariant =
    status === 'ios-safari'
      ? 'ios-safari'
      : status === 'ios-other'
        ? 'ios-other'
        : 'unsupported';

  return (
    <>
      <div className="space-y-3">
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted px-1">
          Installasjon
        </p>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-base font-medium text-text">
                Installer Tørny som app
              </h2>
              <p className="text-sm text-muted mt-0.5">
                Legg til på hjem-skjermen for raskere tilgang
              </p>
            </div>
            <button
              type="button"
              onClick={onClick}
              className="shrink-0 ml-4 rounded-full border border-border bg-surface px-4 py-2 font-sans text-[13px] font-medium text-text hover:bg-bg transition-colors"
            >
              Installer
            </button>
          </div>
        </Card>
      </div>
      <InstallInstructionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        variant={modalVariant}
      />
    </>
  );
}
