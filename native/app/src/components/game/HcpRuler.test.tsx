// #2297: handicaplinjalen (Type C).
//
// Det som låses her er hvem som eier posisjonen (evaluatoren, runde 1 og 2):
// fingeren. En scroll-hendelse gir et nytt tall opp, men ruller aldri linjalen
// selv. Bare startposisjonen (én gang) og VoiceOver-trinnene kaller `scrollTo`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { hcpToOffset } from '../../lib/hcpRuler';
import { HcpRuler, tickLabel } from './HcpRuler';

const scrollTo = ScrollView.prototype.scrollTo as jest.Mock;

async function renderRuler(value = 14.2, stored = 14.2) {
  const onChange = jest.fn();
  await render(
    <HcpRuler value={value} min={-8} stored={stored} onChange={onChange} accessibilityValueText="14,2" />,
  );
  // Bredden kommer fra layout, og først da tegnes merkene.
  await fireEvent(screen.getByTestId('hcp-ruler'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 64 } },
  });
  return onChange;
}

function scroll(x: number) {
  return fireEvent.scroll(screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true }), {
    nativeEvent: {
      contentOffset: { x, y: 0 },
      contentSize: { width: 8000, height: 64 },
      layoutMeasurement: { width: 350, height: 64 },
    },
  });
}

beforeEach(() => scrollTo.mockClear());

describe('HcpRuler', () => {
  it('er én justerbar flate for skjermleseren', async () => {
    await renderRuler();
    const ruler = screen.getByTestId('hcp-ruler');
    expect(ruler.props.accessibilityRole).toBe('adjustable');
    expect(ruler.props.accessibilityLabel).toBe('Handicap');
    expect(ruler.props.accessibilityValue).toMatchObject({ text: '14,2' });
  });

  it('starter på det lagrede tallet, én gang', async () => {
    await renderRuler(14.2);
    const view = screen.getByTestId('hcp-ruler-scroll', { includeHiddenElements: true });
    expect(view.props.contentOffset).toEqual({ x: hcpToOffset(14.2, -8), y: 0 });
    await fireEvent(view, 'contentSizeChange', 8000, 64);
    await fireEvent(view, 'contentSizeChange', 8100, 64);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ x: 222 * 12, animated: false });
  });

  it('melder et nytt tall når den rulles, men ruller aldri selv', async () => {
    const onChange = await renderRuler(14.2);
    // 14,2 står ved 222 merker; fire merker til venstre er 13,8.
    await scroll(218 * 12);
    await scroll(218 * 12 + 4);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(13.8);
    // Et kast som spretter forbi plussenden gir enden, og ingen rulling tilbake.
    await scroll(-60);
    expect(onChange).toHaveBeenLastCalledWith(-8);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('VoiceOver flytter én tidel og ruller dit i samme handling', async () => {
    const onChange = await renderRuler(14.2);
    const ruler = screen.getByTestId('hcp-ruler');
    await fireEvent(ruler, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(14.1);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: hcpToOffset(14.1, -8), animated: false });
    await fireEvent(ruler, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await fireEvent(ruler, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(14.3);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: hcpToOffset(14.3, -8), animated: false });
    // Scroll-hendelsen fra den rullingen gir ingen ekstra melding.
    onChange.mockClear();
    await scroll(hcpToOffset(14.3, -8));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stopper på endene også for skjermleseren', async () => {
    const onChange = await renderRuler(-8, -8);
    await fireEvent(screen.getByTestId('hcp-ruler'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('har prikken på det lagrede tallet, og plusstegn på plussiden', async () => {
    await renderRuler(13.8, 14.2);
    const dot = screen.getByTestId('hcp-ruler-dot', { includeHiddenElements: true });
    // Halve bredden (175) + 222 merker − halve prikken.
    expect(dot).toHaveStyle({ left: 175 + 222 * 12 - 3.5 });
    // Merkene står i Svg, så tallene leses fra funksjonen som skriver dem.
    expect([-80, -10, 0, 140, 540].map(tickLabel)).toEqual(['+8', '+1', '0', '14', '54']);
  });
});
