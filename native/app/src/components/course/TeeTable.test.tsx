// native/app/src/components/course/TeeTable.test.tsx
// #2757: tee-brikkene og tabellen (Type C). Hva et trykk gjør, er låst i
// `lib/courses/teeChips.test.ts`; her er koblingen på telefonen.
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { emptyCourseDraft, courseDraftToFormData, type TeeDraft } from '../../lib/courseDraft';
import { TeeTable } from './TeeTable';

let latest: TeeDraft[] = [];

function Harness() {
  const [tees, setTees] = useState<TeeDraft[]>([]);
  return (
    <TeeTable
      tees={tees}
      nine={false}
      onTees={(next) => {
        latest = next;
        setTees(next);
      }}
    />
  );
}

beforeEach(() => {
  latest = [];
});

describe('TeeTable', () => {
  it('en farge legger til en rad, og et nytt trykk tar den bort', async () => {
    await render(<Harness />);
    expect(screen.queryByTestId('tee-table')).toBeNull();

    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    expect(latest.map((tee) => [tee.name, tee.color])).toEqual([['Gul', 'yellow']]);
    expect(screen.getByTestId('tee-chip-yellow').props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('tee-0-slope-mens')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    expect(latest).toEqual([]);
    expect(screen.queryByTestId('tee-table')).toBeNull();
  });

  it('«+ Annen» legger til et eget navn, og sier fra om et navn som finnes', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    await fireEvent.press(screen.getByTestId('tee-chip-other'));

    await fireEvent.changeText(screen.getByTestId('tee-custom-name'), 'gul');
    expect(screen.getByTestId('tee-custom-duplicate').props.children).toBe('Banen har alt en tee som heter gul');
    await fireEvent.press(screen.getByTestId('tee-custom-add'));
    expect(latest).toHaveLength(1);

    await fireEvent.changeText(screen.getByTestId('tee-custom-name'), '57');
    await fireEvent.press(screen.getByTestId('tee-custom-add'));
    expect(latest.map((tee) => [tee.name, tee.color])).toEqual([
      ['Gul', 'yellow'],
      ['57', null],
    ]);
    expect(screen.queryByTestId('tee-custom-name')).toBeNull();

    // Egen brikke, og et trykk tar den bort.
    await fireEvent.press(screen.getByTestId('tee-chip-custom-57'));
    expect(latest.map((tee) => tee.name)).toEqual(['Gul']);
  });

  it('maks sju: de andre brikkene er dempet, og det står hvorfor', async () => {
    await render(<Harness />);
    for (const color of ['white', 'yellow', 'blue', 'red', 'orange']) {
      await fireEvent.press(screen.getByTestId(`tee-chip-${color}`));
    }
    for (const name of ['57', '60']) {
      await fireEvent.press(screen.getByTestId('tee-chip-other'));
      await fireEvent.changeText(screen.getByTestId('tee-custom-name'), name);
      await fireEvent.press(screen.getByTestId('tee-custom-add'));
    }
    expect(latest).toHaveLength(7);
    expect(screen.getByTestId('tee-max').props.children).toBe('Banen kan ha opptil 7 tee-er');
    expect(screen.getByTestId('tee-chip-other').props.accessibilityState.disabled).toBe(true);
    // En valgt brikke kan fortsatt tas av.
    expect(screen.getByTestId('tee-chip-yellow').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    expect(latest).toHaveLength(6);
    expect(screen.queryByTestId('tee-max')).toBeNull();
  });

  it('junior-kolonnen åpnes for alle rader, og lukket kolonne sender ingen tall', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    await fireEvent.press(screen.getByTestId('tee-chip-red'));
    expect(screen.queryByTestId('tee-0-slope-juniors')).toBeNull();

    const flex = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).flex;
    expect(flex('tee-0-cr-mens')).toBeGreaterThan(flex('tee-0-slope-mens'));

    await fireEvent.press(screen.getByTestId('tee-juniors-toggle'));
    expect(screen.getByTestId('tee-1-cr-juniors')).toBeTruthy();
    // Med tre kolonner er feltene like brede, så de holder 44 pt på en smal telefon.
    expect(flex('tee-0-cr-mens')).toBe(flex('tee-0-slope-mens'));
    await fireEvent.changeText(screen.getByTestId('tee-0-slope-juniors'), '120');
    expect(latest[0]!.slope_juniors).toBe('120');

    await fireEvent.press(screen.getByTestId('tee-juniors-toggle'));
    expect(screen.queryByTestId('tee-0-slope-juniors')).toBeNull();
    expect(latest[0]!.slope_juniors).toBe('');
  });

  it('komma i CR står i feltet og er punktum når det når parseren', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    await fireEvent.changeText(screen.getByTestId('tee-0-cr-mens'), '70,5');
    expect(screen.getByTestId('tee-0-cr-mens').props.value).toBe('70,5');
    // Én desimal, som `step` på nettet: kolonnen ville rundet av en andre desimal.
    expect(screen.getByTestId('tee-0-cr-mens').props.maxLength).toBe(4);
    const form = courseDraftToFormData({ ...emptyCourseDraft('Banen'), tees: latest });
    expect(form.get('tee_0_cr_mens')).toBe('70.5');
  });

  it('lengden er valgfri og per tee', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    expect(latest[0]!.length_meters).toBe('');
    await fireEvent.changeText(screen.getByTestId('tee-0-length'), '5800');
    expect(latest[0]!.length_meters).toBe('5800');
  });
});
