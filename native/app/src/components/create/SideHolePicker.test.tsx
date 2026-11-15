// #2283: raden og hullarket når spillet lages (`Sidekonk-oppsett` O1, Type C).
// Tekstene er låst i `createGameCopy.test.ts`; her står koblingen: raden åpner
// arket, et hull velger og lukker, «Velg hull senere» tømmer, og skjermleseren
// får rolle og valgt-tilstand.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { withSlotHole } from '../../lib/wizardPayload';
import { SideHoleRow, SideHoleSheet, type SideHoleSlot } from './SideHolePicker';

jest.mock('react-native-safe-area-context', () => require('../../test/safeAreaMock').safeAreaMock());

/** To plasser for nærmest pinnen, som SetupStep tegner dem. */
function Harness({ initial = [] as (number | null)[] }) {
  const [holes, setHoles] = useState(initial);
  const [slot, setSlot] = useState<SideHoleSlot | null>(null);
  return (
    <>
      {[1, 2].map((position) => (
        <SideHoleRow
          key={position}
          category="closest_to_pin"
          position={position}
          count={2}
          hole={holes[position - 1] ?? null}
          onPress={() => setSlot({ category: 'closest_to_pin', position, count: 2 })}
        />
      ))}
      <SideHoleSheet
        slot={slot}
        value={slot ? (holes[slot.position - 1] ?? null) : null}
        onPick={(hole) => slot && setHoles((prev) => withSlotHole(prev, slot.position, hole))}
        onClose={() => setSlot(null)}
      />
    </>
  );
}

describe('SideHolePicker', () => {
  it('raden åpner arket, et hull velger og lukker, og «Velg hull senere» tømmer plassen', async () => {
    await render(<Harness />);
    const row = screen.getByTestId('create-side-ctp-hole-1');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Hull for nærmest pinnen 1: ikke valgt');
    expect(screen.getAllByText('Velg hull')).toHaveLength(2);

    await fireEvent.press(row);
    expect(screen.getByRole('header', { name: 'Nærmest pinnen 1' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('create-side-ctp-hole-1-pick-7'));
    expect(screen.queryByTestId('create-side-hole-sheet')).toBeNull();
    expect(screen.getByText('Hull 7')).toBeTruthy();
    expect(screen.getByTestId('create-side-ctp-hole-1').props.accessibilityLabel).toBe(
      'Hull for nærmest pinnen 1: hull 7',
    );

    await fireEvent.press(screen.getByTestId('create-side-ctp-hole-1'));
    expect(screen.getByTestId('create-side-ctp-hole-1-pick-7').props.accessibilityState).toEqual({ selected: true });
    await fireEvent.press(screen.getByTestId('create-side-ctp-hole-1-later'));
    expect(screen.queryByText('Hull 7')).toBeNull();
  });

  it('et hull den andre plassen har, flyttes i stedet for å gi to like', async () => {
    await render(<Harness initial={[7, null]} />);
    await fireEvent.press(screen.getByTestId('create-side-ctp-hole-2'));
    await fireEvent.press(screen.getByTestId('create-side-ctp-hole-2-pick-7'));
    expect(screen.getByTestId('create-side-ctp-hole-1').props.accessibilityLabel).toBe(
      'Hull for nærmest pinnen 1: ikke valgt',
    );
    expect(screen.getByTestId('create-side-ctp-hole-2').props.accessibilityLabel).toBe(
      'Hull for nærmest pinnen 2: hull 7',
    );
  });
});
