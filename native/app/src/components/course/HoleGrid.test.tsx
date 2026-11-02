// native/app/src/components/course/HoleGrid.test.tsx
// #2757: hullkortet (Type C). Reglene er testet i `courseDraft.test.ts`; her er
// det koblingen: trykket bytter par, fokus flytter seg, linja følger tallene.
import { useState } from 'react';
import { Keyboard, TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { emptyCourseDraft, setHoleCount, setHoleIndex, type CourseDraft } from '../../lib/courseDraft';
import { HoleGrid } from './HoleGrid';

function Harness({ initial }: { initial: CourseDraft }) {
  const [draft, setDraft] = useState(initial);
  return <HoleGrid draft={draft} onChange={setDraft} />;
}

const focusSpy = () => TextInput.prototype.focus as unknown as jest.Mock;
const lastFocused = () => {
  const contexts = focusSpy().mock.contexts as { props: { testID?: string } }[];
  return contexts.at(-1)?.props.testID;
};

beforeEach(() => {
  focusSpy().mockClear();
});

describe('HoleGrid', () => {
  it('et trykk på par bytter 4 → 5 → 6 → 3 og oppdaterer summen', async () => {
    await render(<Harness initial={emptyCourseDraft('Banen')} />);
    expect(screen.getByTestId('course-par-total').props.children).toBe('Par 72');

    const par = () => screen.getByTestId('course-par-3');
    expect(par().props.accessibilityLabel).toBe('Par for hull 3: 4. Trykk for å endre');
    await fireEvent.press(par());
    expect(par().props.accessibilityLabel).toBe('Par for hull 3: 5. Trykk for å endre');
    await fireEvent.press(par());
    expect(par().props.accessibilityLabel).toBe('Par for hull 3: 6. Trykk for å endre');
    expect(screen.getByTestId('course-par-total').props.children).toBe('Par 74');
    await fireEvent.press(par());
    expect(par().props.accessibilityLabel).toBe('Par for hull 3: 3. Trykk for å endre');
  });

  it('2–9 flytter fokus med én gang, 1 venter på neste siffer', async () => {
    await render(<Harness initial={emptyCourseDraft('Banen')} />);

    await fireEvent.changeText(screen.getByTestId('course-index-1-1'), '5');
    expect(lastFocused()).toBe('course-index-1-2');

    focusSpy().mockClear();
    await fireEvent.changeText(screen.getByTestId('course-index-1-2'), '1');
    expect(focusSpy()).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('course-index-1-2'), '12');
    expect(lastFocused()).toBe('course-index-1-3');
  });

  it('fokus går fra hull 9 til hull 10, og siste felt lukker tastaturet', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await render(<Harness initial={emptyCourseDraft('Banen')} />);

    await fireEvent.changeText(screen.getByTestId('course-index-1-9'), '7');
    expect(lastFocused()).toBe('course-index-1-10');

    expect(dismiss).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('course-index-1-18'), '8');
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it('linja under kortene sier hva som mangler og hva som er dobbelt', async () => {
    await render(<Harness initial={emptyCourseDraft('Banen')} />);
    const line = () => screen.getByTestId('course-index-line').props.children;
    expect(line()).toBe('Skriv av indeksen fra scorekortet. Hvert tall fra 1 til 18 brukes én gang.');

    await fireEvent.changeText(screen.getByTestId('course-index-1-1'), '7');
    expect(line()).toBe('Mangler 17 indekser. Hvert tall fra 1 til 18 brukes én gang.');

    await fireEvent.changeText(screen.getByTestId('course-index-1-2'), '7');
    expect(line()).toBe('Indeks 7 er brukt mer enn én gang');
  });

  it('færre enn sju som mangler står som tall, og alle 18 gir ingen linje', async () => {
    const full = Array.from({ length: 16 }, (_, i) => i).reduce(
      (draft, i) => setHoleIndex(draft, i, String(i + 1)),
      emptyCourseDraft('Banen'),
    );
    await render(<Harness initial={full} />);
    expect(screen.getByTestId('course-index-line').props.children).toBe(
      'Mangler indeks 17 og 18. Hvert tall fra 1 til 18 brukes én gang.',
    );
    await fireEvent.changeText(screen.getByTestId('course-index-1-17'), '17');
    await fireEvent.changeText(screen.getByTestId('course-index-1-18'), '18');
    expect(screen.queryByTestId('course-index-line')).toBeNull();
  });

  it('18 hull har to kort, 9 hull ett med to indeksrader', async () => {
    await render(<Harness initial={emptyCourseDraft('Banen')} />);
    expect(screen.getByTestId('course-card-1')).toBeTruthy();
    expect(screen.getByTestId('course-card-10')).toBeTruthy();
    expect(screen.queryByTestId('course-index-2-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('course-holes-9'));
    expect(screen.queryByTestId('course-card-10')).toBeNull();
    expect(screen.getByTestId('course-index-2-9')).toBeTruthy();
    expect(screen.getByTestId('course-par-total').props.children).toBe('Par 36 · 72 for 18 hull');
  });

  it('på 9 hull går fokus fra første runde til andre', async () => {
    await render(<Harness initial={setHoleCount(emptyCourseDraft('Banen'), 9)} />);
    await fireEvent.changeText(screen.getByTestId('course-index-1-9'), '9');
    expect(lastFocused()).toBe('course-index-2-1');
  });

  it('«Fordel» står bare med én indeks per hull, og fyller begge radene', async () => {
    let draft = setHoleCount(emptyCourseDraft('Banen'), 9);
    await render(<Harness initial={draft} />);
    expect(screen.queryByTestId('course-split')).toBeNull();

    for (let i = 0; i < 9; i++) {
      draft = setHoleIndex(draft, i, String(i + 1));
      await fireEvent.changeText(screen.getByTestId(`course-index-1-${i + 1}`), String(i + 1));
    }
    await fireEvent.press(screen.getByTestId('course-split'));

    expect(screen.getByTestId('course-index-1-2').props.value).toBe('3');
    expect(screen.getByTestId('course-index-2-2').props.value).toBe('4');
    expect(screen.getByTestId('course-split-done')).toBeTruthy();
    expect(screen.queryByTestId('course-split')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('course-index-2-2'), '5');
    expect(screen.queryByTestId('course-split-done')).toBeNull();
  });
});
