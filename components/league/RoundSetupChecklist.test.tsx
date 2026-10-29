import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createTranslator } from 'next-intl';
import noMessages from '@/messages/no.json';
import { SIM_SETTING_KEYS, SIM_SETTING_DEFAULTS, roundSimSettings } from '@/lib/league/simSettings';
import { RoundSetupChecklist } from './RoundSetupChecklist';

// Type B: the rendered checklist. Copy is read from the catalog, never typed
// here (Type C discipline); the order and the absence of «standard» and
// «endret» are what is asserted.
const t = createTranslator({ locale: 'no', messages: noMessages, namespace: 'liga.simSettings' });

const round = (override: Record<string, string> = {}): Parameters<typeof RoundSetupChecklist>[0]['round'] => {
  const effective = roundSimSettings({
    leagueDefault: SIM_SETTING_DEFAULTS,
    override,
    frozenDefault: null,
    started: false,
  });
  return {
    simSettings: effective.values,
    teeName: 'Gul',
    courseName: 'St Andrews',
  };
};

const renderCard = async (r: ReturnType<typeof round>) =>
  render((await RoundSetupChecklist({ round: r, locale: 'no' })) as React.ReactElement);

const rowTexts = (list: HTMLElement) =>
  Array.from(list.querySelectorAll('[data-testid^="round-setup-setting-"]')).map((el) => [
    el.getAttribute('data-testid')!.replace('round-setup-setting-', ''),
    el.querySelector('dd')!.textContent,
  ]);

describe('RoundSetupChecklist (#2666)', () => {
  it('shows course and tee first, then all eight settings in Trackman order', async () => {
    await renderCard(round());
    const card = screen.getByTestId('round-setup-checklist');
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(t('checklist.title'));
    expect(within(screen.getByTestId('round-setup-course')).getByRole('definition')).toHaveTextContent('St Andrews');
    expect(within(screen.getByTestId('round-setup-tee')).getByRole('definition')).toHaveTextContent('Gul');
    // Course and tee sit above the settings in the document.
    const all = Array.from(card.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'));
    expect(all.indexOf('round-setup-tee')).toBeLessThan(all.indexOf('round-setup-setting-pins'));
    expect(rowTexts(card).map(([key]) => key)).toEqual([...SIM_SETTING_KEYS]);
    expect(rowTexts(card)).toHaveLength(8);
  });

  it('lists the same eight rows whether or not the organiser overrode some for the round', async () => {
    await renderCard(round());
    const plain = rowTexts(screen.getByTestId('round-setup-checklist')).map(([key]) => key);
    document.body.innerHTML = '';
    await renderCard(round({ wind: 'STRONG_BREEZE', green_stimp: '11', mulligans: 'ALWAYS' }));
    const card = screen.getByTestId('round-setup-checklist');
    expect(rowTexts(card).map(([key]) => key)).toEqual(plain);
    const values = Object.fromEntries(rowTexts(card));
    expect([values.wind, values.green_stimp]).toEqual(['Strong Breeze', '11 (3,4 m)']);
  });

  it('never writes «standard» or «endret» to the player', async () => {
    await renderCard(round({ wind: 'STRONG_BREEZE' }));
    const text = screen.getByTestId('round-setup-checklist').textContent!.toLowerCase();
    expect(text).not.toContain('standard');
    expect(text).not.toContain('endret');
    expect(text).not.toContain(t('overridden').toLowerCase());
  });

  it('leaves out a course or tee row that has no name instead of drawing an empty one', async () => {
    await renderCard({ ...round(), courseName: null });
    expect(screen.queryByTestId('round-setup-course')).toBeNull();
    expect(screen.getByTestId('round-setup-tee')).toBeInTheDocument();
  });
});
