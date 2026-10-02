import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ReadyChecklist, type ReadyChecklistItem } from './ReadyChecklist';

// Én Type C render-test (docs/test-discipline.md): hva sjekklista på «Klar?»
// gjør med radene den får (#2282). Reglene for status og mål er dekket av
// readyChecklistRules.test.ts; her er spørsmålet om lista rendrer dem riktig.
// Setup-stubben (vitest.setup.ts) resolver next-intl mot no.json.
const ITEMS: ReadyChecklistItem[] = [
  { key: 'course', status: 'ok', messages: [], target: 3, label: 'Bane', value: 'Byneset North, Gul tee' },
  { key: 'format', status: 'ok', messages: [], target: null, label: 'Format', value: 'Stableford, 85 % handicap' },
  { key: 'teeOff', status: 'block', messages: ['tee-off-tid'], target: 3, label: 'Tee-off', value: 'Mangler: tee-off-tid' },
  { key: 'players', status: 'warn', messages: [], target: 4, label: 'Spillere', value: '3 av 4. Du kan legge til flere senere.' },
];

describe('ReadyChecklist (#2282)', () => {
  it('fire rader, «Endre» bare der raden har et mål, statusordet først, fokusringen innenfor kortet', () => {
    const { container } = render(<ReadyChecklist items={ITEMS} onEdit={vi.fn()} />);

    const list = container.querySelector('ul')!;
    expect(list).toHaveAttribute('data-focus-inset');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    const course = screen.getByTestId('ready-row-course');
    expect(within(course).getByRole('button')).toHaveAccessibleName(
      /^I orden: Bane · Byneset North, Gul tee Endre$/,
    );

    const format = screen.getByTestId('ready-row-format');
    expect(within(format).queryByRole('button')).toBeNull();
    expect(format).not.toHaveTextContent('Endre');

    expect(within(screen.getByTestId('ready-row-teeOff')).getByRole('button')).toHaveAccessibleName(
      /^Ikke klar: Tee-off · Mangler: tee-off-tid Endre$/,
    );
    expect(screen.getByTestId('ready-row-players')).toHaveAttribute('data-status', 'warn');
    expect(within(screen.getByTestId('ready-row-players')).getByRole('button')).toHaveAccessibleName(
      /^Merk: Spillere/,
    );
  });
});
