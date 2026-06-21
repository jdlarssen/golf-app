'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { SettingRow } from '@/components/ui/SettingRow';
import { InstallInstructionsModal } from './InstallInstructionsModal';

/**
 * Renders a localizable "Install app" row for the profile settings list. Self-hides
 * when the app is already installed (`standalone`) or while the prompt status
 * is still loading, so it slots into a {@link SettingList} as an optional row.
 */
export function InstallButton() {
  const t = useTranslations('installButton');
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
      <SettingRow label={t('label')} onClick={onClick} />
      <InstallInstructionsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        variant={modalVariant}
      />
    </>
  );
}
