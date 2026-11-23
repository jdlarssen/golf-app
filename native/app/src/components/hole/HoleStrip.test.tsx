// #2385: den ene render-testen (Type C) for hullstripa. Den låser det som
// bare kan sees her: ni hull i halvdelen du står i, brikken som bytter til de
// andre ni, skjermleserens tekst per hull, og at et trykk gir hullet videre.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import source from '../../../../../messages/no.json';
import { CHIP_SLOP, HoleStrip, STRIP_EDGE, STRIP_GAP, STRIP_LABELS } from './HoleStrip';

const ALL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

describe('HoleStrip', () => {
  it('bruker webbens skjermleser-tekster ordrett', () => {
    const web = source.holes.entry;
    expect(STRIP_LABELS).toEqual({
      plain: web.hullAriaLabel,
      done: web.hullAriaLabelDone,
      missing: web.hullAriaLabelMissing,
    });
  });

  it('viser halvdelen du står i, bytter halvdel med brikken, og går til hullet du trykker på', async () => {
    const onGo = jest.fn();
    await render(<HoleStrip holeNumber={7} holes={ALL_HOLES} filled={[1, 2, 3]} onGo={onGo} />);
    const current = screen.getByTestId('hole-strip-7');

    expect(screen.getByTestId('hole-strip-9')).toBeTruthy();
    expect(screen.queryByTestId('hole-strip-10')).toBeNull();
    expect(current).toBeSelected();
    expect(screen.getByLabelText('Hull 2 – score ført')).toBeTruthy();
    expect(screen.getByLabelText('Hull 5 – mangler score')).toBeTruthy();
    expect(screen.getByLabelText('Hull 8')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Vis hull 10–18'));
    expect(screen.getByTestId('hole-strip-18')).toBeTruthy();
    expect(screen.queryByTestId('hole-strip-9')).toBeNull();
    expect(screen.getByLabelText('Vis hull 1–9')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('hole-strip-12'));
    expect(onGo).toHaveBeenCalledWith(12);
  });

  it('har ingen brikke når spillet bare har andre halvdel (#2752)', async () => {
    await render(<HoleStrip holeNumber={12} holes={ALL_HOLES.slice(9)} filled={[]} onGo={jest.fn()} />);

    expect(screen.getByTestId('hole-strip-10')).toBeTruthy();
    expect(screen.getByTestId('hole-strip-18')).toBeTruthy();
    expect(screen.queryByTestId('hole-strip-9')).toBeNull();
    expect(screen.queryByTestId('hole-strip-other-half')).toBeNull();
  });

  // #2928: trykkflatene møtes. Hvert hull får halve mellomrommet på hver side,
  // det første går ut til kanten, og det siste før brikka overlater luften til
  // brikkas egen utvidelse. Ingenting som tegnes endres (stilen er den samme).
  describe('trykkflaten mellom hullene (#2928)', () => {
    const slopOf = (n: number) => screen.getByTestId(`hole-strip-${n}`).props.hitSlop;

    it('lar nabohullene møtes uten overlapp, fra kanten til brikka', async () => {
      await render(<HoleStrip holeNumber={7} holes={ALL_HOLES} filled={[]} onGo={jest.fn()} />);
      const shown = ALL_HOLES.slice(0, 9);
      expect(slopOf(1).left).toBe(STRIP_EDGE);
      for (let i = 0; i < shown.length - 1; i++) {
        expect(slopOf(shown[i]).right + slopOf(shown[i + 1]).left).toBe(STRIP_GAP);
      }
      // Luften mellom hull 9 og brikka er mellomrommet pluss brikkas marg, og
      // brikka dekker alt selv.
      const chip = screen.getByTestId('hole-strip-other-half');
      const chipMargin = StyleSheet.flatten(chip.props.style).marginLeft as number;
      expect(slopOf(9).right + chip.props.hitSlop.left).toBe(STRIP_GAP + chipMargin);
      expect(slopOf(9).right).toBe(0);
      expect(chip.props.hitSlop).toEqual(CHIP_SLOP);
    });

    it('gjør det samme på andre halvdel', async () => {
      await render(<HoleStrip holeNumber={14} holes={ALL_HOLES} filled={[]} onGo={jest.fn()} />);
      expect(slopOf(10).left).toBe(STRIP_EDGE);
      for (let n = 10; n < 18; n++) {
        expect(slopOf(n).right + slopOf(n + 1).left).toBe(STRIP_GAP);
      }
      expect(slopOf(18).right).toBe(0);
    });

    it('uten brikke går det siste hullet ut til kanten', async () => {
      await render(<HoleStrip holeNumber={12} holes={ALL_HOLES.slice(9)} filled={[]} onGo={jest.fn()} />);
      expect(slopOf(10).left).toBe(STRIP_EDGE);
      expect(slopOf(18).right).toBe(STRIP_EDGE);
    });

    it('endrer ikke det som tegnes: 34 pt brede flater og 22 × 30 piller', async () => {
      await render(<HoleStrip holeNumber={7} holes={ALL_HOLES} filled={[]} onGo={jest.fn()} />);
      expect(StyleSheet.flatten(screen.getByTestId('hole-strip-3').props.style)).toMatchObject({ width: 34, height: 44 });
      expect(StyleSheet.flatten(screen.getByTestId('hole-strip-3-pill').props.style)).toMatchObject({ width: 22, height: 30 });
    });
  });
});
