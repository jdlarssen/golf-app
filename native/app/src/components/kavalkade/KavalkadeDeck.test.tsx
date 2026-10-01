// #2265 PR 2: kortstokken. Type A for hvor skinna stopper (webbens
// `snap-center`), Type C for fanene.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { buildKavalkadeDeck } from '../../../../../lib/kavalkade/kavalkadeCards';
import { makeKavalkadeFacts } from '../../test/kavalkadeFixtures';
import { KavalkadeDeck, kavalkadeSnapOffsets } from './KavalkadeDeck';

describe('kavalkadeSnapOffsets', () => {
  it('centres the middle cards and stops the first and last at the rail’s edges', () => {
    // 390 pt bred skjerm: kortet er 88 % av 350 = 308, med 16 mellom.
    // Innholdet er 20 + 4 · 308 + 3 · 16 + 20 = 1320, så skinna går til 930.
    expect(kavalkadeSnapOffsets(4, 390, 308)).toEqual([0, 303, 627, 930]);
    expect(kavalkadeSnapOffsets(1, 390, 308)).toEqual([0]);
  });
});

describe('KavalkadeDeck', () => {
  it('opens on «Ditt år» and switches to «Gjengen», with the place of each card', async () => {
    await render(<KavalkadeDeck deck={buildKavalkadeDeck(makeKavalkadeFacts())} />);

    const personal = screen.getByRole('tab', { name: 'Ditt år' });
    expect(personal.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('kavalkade-card-year')).toBeTruthy();
    expect(screen.getByLabelText(/^Kort 1 av 6\. Året ditt\./)).toBeTruthy();

    await fireEvent.press(screen.getByRole('tab', { name: 'Gjengen' }));
    expect(screen.getByRole('tab', { name: 'Gjengen' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByTestId('kavalkade-card-year')).toBeNull();
    expect(screen.getByLabelText(/^Kort 1 av 5\. Gjengen\. 6 spillere\./)).toBeTruthy();
  });

  it('opens on «Gjengen» under the threshold, as the web does', async () => {
    await render(
      <KavalkadeDeck deck={buildKavalkadeDeck(makeKavalkadeFacts({ personal: null, team: null }))} />,
    );
    expect(screen.getByRole('tab', { name: 'Gjengen' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('says so when a tab has no cards', async () => {
    await render(<KavalkadeDeck deck={buildKavalkadeDeck(makeKavalkadeFacts({ gang: null }))} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Gjengen' }));
    expect(screen.getByTestId('kavalkade-tab-empty')).toHaveTextContent('Ingen kort i denne fanen i år.');
  });
});
