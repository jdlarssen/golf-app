// #2675: markørvelgeren ved levering har søk og «Vis alle» med samme regel som
// medspillerlista (`pickerRows`), og den valgte blir stående (Type C).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { MarkerPicker } from './MarkerPicker';

const NAMES = ['Anne', 'Bård', 'Cato', 'Dag', 'Eli', 'Finn', 'Gro', 'Hans', 'Iris'];
const OPTIONS = NAMES.map((name) => ({ userId: name.toLowerCase(), name }));

function Harness({ options = OPTIONS }: { options?: typeof OPTIONS }) {
  const [value, setValue] = useState<string | null>(null);
  return <MarkerPicker options={options} value={value} onChange={setValue} />;
}

const shown = () =>
  screen.queryAllByTestId(/^marker-option-/).map((node) => String(node.props.testID).replace('marker-option-', ''));

it('mer enn seks valg: seks rader, søkefelt og «Vis alle 9», og «Vis færre» tar dem tilbake', async () => {
  await render(<Harness />);
  expect(shown()).toEqual(['anne', 'bård', 'cato', 'dag', 'eli', 'finn']);
  expect(screen.getByTestId('marker-search')).toBeTruthy();
  expect(screen.getByTestId('marker-show-all')).toHaveTextContent('Vis alle 9');

  await fireEvent.press(screen.getByTestId('marker-show-all'));
  expect(shown()).toHaveLength(9);
  expect(screen.getByTestId('marker-show-all')).toHaveTextContent('Vis færre');

  await fireEvent.press(screen.getByTestId('marker-show-all'));
  expect(shown()).toHaveLength(6);
});

it('søket filtrerer på navnet, og null treff gir «Ingen spillere med det navnet.»', async () => {
  await render(<Harness />);
  await fireEvent.changeText(screen.getByTestId('marker-search'), 'ir');
  expect(shown()).toEqual(['iris']);
  expect(screen.queryByTestId('marker-show-all')).toBeNull();

  await fireEvent.changeText(screen.getByTestId('marker-search'), 'xyz');
  expect(shown()).toEqual([]);
  expect(screen.getByTestId('marker-no-match')).toHaveTextContent('Ingen spillere med det navnet.');
});

it('den valgte blir stående når lista er kuttet', async () => {
  await render(<Harness />);
  await fireEvent.changeText(screen.getByTestId('marker-search'), 'iris');
  await fireEvent.press(screen.getByTestId('marker-option-iris'));
  await fireEvent.changeText(screen.getByTestId('marker-search'), '');
  expect(shown()).toEqual(['anne', 'bård', 'cato', 'dag', 'eli', 'finn', 'iris']);
  expect(screen.getByTestId('marker-option-iris').props.accessibilityState).toEqual({ checked: true });
});

it('seks valg eller færre: ingen søkefelt og ingen «Vis alle»', async () => {
  await render(<Harness options={OPTIONS.slice(0, 6)} />);
  expect(shown()).toHaveLength(6);
  expect(screen.queryByTestId('marker-search')).toBeNull();
  expect(screen.queryByTestId('marker-show-all')).toBeNull();
});
