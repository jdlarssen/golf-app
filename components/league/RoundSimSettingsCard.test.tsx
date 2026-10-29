import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import { SIM_SETTING_DEFAULTS, roundSimSettings } from '@/lib/league/simSettings';
import { RoundSimSettingsCard } from './RoundSimSettingsCard';

// Type B (#2666): the folded card on the league page shows the round's
// settings without marking what the organiser changed. The organiser's page
// keeps its mark (LigaRoundRow.test.tsx).
const t = createTranslator({ locale: 'no', messages: noMessages, namespace: 'liga.simSettings' });

describe('RoundSimSettingsCard (#2666)', () => {
  it('shows the overridden values like any other, with no «Endret denne runden» and no «standard»', async () => {
    const effective = roundSimSettings({
      leagueDefault: SIM_SETTING_DEFAULTS,
      override: { wind: 'STRONG_BREEZE', green_stimp: '11' },
      frozenDefault: null,
      started: false,
    });
    // The snapshot still carries the keys the organiser overrode.
    expect(effective.overriddenKeys.length).toBeGreaterThan(0);
    render(
      (await RoundSimSettingsCard({
        round: { simSettings: effective.values, teeName: 'Gul' },
        locale: 'no',
      })) as React.ReactElement,
    );
    const card = screen.getByTestId('sim-settings-card');
    expect(screen.getByTestId('sim-setting-wind')).toHaveTextContent('Strong Breeze');
    expect(screen.getByTestId('sim-setting-green_stimp')).toHaveTextContent('11 (3,4 m)');
    expect(card).not.toHaveTextContent(t('overridden'));
    expect(card.textContent!.toLowerCase()).not.toContain('standard');
    expect(screen.queryByTestId('sim-setting-overridden')).toBeNull();
  });
});
