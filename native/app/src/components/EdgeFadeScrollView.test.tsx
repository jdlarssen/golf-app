// #2930 (Type C): en rad som ruller sidelengs viser en myk kant bare der det er
// mer å se. Målingene (bredde, innhold, posisjon) kommer fra RN sine hendelser;
// her er det formen: hvilke kanter som står, fargen fra flaten bak, at de
// verken tar trykk eller leses opp, og at to rader ikke deler gradient.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text, View, processColor } from 'react-native';
import { SUNLIGHT_THEME, ThemeScope, themeFor, type Theme } from '../theme';
import { EdgeFadeScrollView } from './EdgeFadeScrollView';

const ROW_WIDTH = 300;

async function measure(testID: string, content: number, offset = 0) {
  const row = screen.getByTestId(testID);
  await fireEvent(row, 'layout', { nativeEvent: { layout: { width: ROW_WIDTH, height: 44 } } });
  await fireEvent(row, 'contentSizeChange', content, 44);
  await fireEvent.scroll(row, {
    nativeEvent: {
      contentOffset: { x: offset, y: 0 },
      contentSize: { width: content, height: 44 },
      layoutMeasurement: { width: ROW_WIDTH, height: 44 },
    },
  });
}

// Gradienten som RN-svg gir videre til native: [offset, farge, offset, farge],
// med fargen som fortegnet ARGB-tall.
type Gradient = { name: string; gradient: number[] };
function gradients(): Gradient[] {
  const out: Gradient[] = [];
  const walk = (node: unknown) => {
    if (node == null || typeof node !== 'object') return;
    const n = node as { type?: string; props?: Gradient; children?: unknown[] };
    if (n.type === 'RNSVGLinearGradient' && n.props) out.push(n.props);
    n.children?.forEach(walk);
  };
  const tree = screen.toJSON();
  (Array.isArray(tree) ? tree : [tree]).forEach(walk);
  return out;
}
const rgb = (argb: number) => argb & 0xffffff;
const rgbOf = (hex: string) => rgb(processColor(hex) as number);

const fades = () => ({
  left: screen.queryByTestId('edge-fade-left', { hidden: true }),
  right: screen.queryByTestId('edge-fade-right', { hidden: true }),
});

function row(props: Partial<React.ComponentProps<typeof EdgeFadeScrollView>> = {}, testID = 'row') {
  return (
    <EdgeFadeScrollView testID={testID} {...props}>
      <Text>innhold</Text>
    </EdgeFadeScrollView>
  );
}

describe('EdgeFadeScrollView', () => {
  it('innhold som får plass: ingen toning', async () => {
    await render(row());
    await measure('row', 280);
    expect(fades()).toEqual({ left: null, right: null });
    await measure('row', ROW_WIDTH);
    expect(fades()).toEqual({ left: null, right: null });
  });

  it('bredere innhold: høyre kant ved start, begge i midten, venstre ved enden', async () => {
    await render(row());
    await measure('row', 600, 0);
    expect(fades().left).toBeNull();
    expect(fades().right).toBeTruthy();

    await measure('row', 600, 120);
    expect(fades().left).toBeTruthy();
    expect(fades().right).toBeTruthy();

    await measure('row', 600, 300);
    expect(fades().left).toBeTruthy();
    expect(fades().right).toBeNull();
  });

  it('toningen tar ikke trykk og leses ikke opp, og et trykk treffer det under', async () => {
    const onPress = jest.fn();
    await render(
      <EdgeFadeScrollView testID="row">
        <Pressable onPress={onPress} testID="card">
          <Text>kort</Text>
        </Pressable>
      </EdgeFadeScrollView>,
    );
    await measure('row', 600, 0);
    const right = fades().right!;
    expect(right.props.pointerEvents).toBe('none');
    expect(right.props.accessibilityElementsHidden).toBe(true);
    expect(right.props.importantForAccessibility).toBe('no-hide-descendants');
    await fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  describe('fargen kommer fra flaten bak', () => {
    const themes: [string, Theme][] = [
      ['lys', themeFor('light')],
      ['natt', themeFor('dark')],
      ['sollys', SUNLIGHT_THEME],
    ];

    it.each(themes)('%s: colors.bg som standard, fadeColor når den er sendt', async (_name, theme) => {
      const { rerender } = await render(<ThemeScope theme={theme}>{row()}</ThemeScope>);
      await measure('row', 600, 120);
      // Én gradient per kant, og begge ender har flatens farge (bare dekningen
      // går fra 0 til 1).
      const colors = () => gradients().flatMap((g) => [rgb(g.gradient[1]!), rgb(g.gradient[3]!)]);
      expect(gradients()).toHaveLength(2);
      expect(colors()).toEqual(Array(4).fill(rgbOf(theme.colors.bg)));

      await rerender(<ThemeScope theme={theme}>{row({ fadeColor: theme.colors.surface })}</ThemeScope>);
      await measure('row', 600, 120);
      expect(colors()).toEqual(Array(4).fill(rgbOf(theme.colors.surface)));
    });
  });

  it('to rader på samme skjerm har ulik gradient-id', async () => {
    await render(
      <View>
        {row({}, 'a')}
        {row({}, 'b')}
      </View>,
    );
    await measure('a', 600, 0);
    await measure('b', 600, 0);
    const ids = gradients().map((g) => g.name);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('style går til den ytre viewen, testID og kallerens hendelser til ScrollView', async () => {
    const onScroll = jest.fn();
    const onLayout = jest.fn();
    await render(
      <View testID="parent">
        {row({ style: { flexGrow: 0 }, onScroll, onLayout })}
      </View>,
    );
    await measure('row', 600, 50);
    expect(onScroll).toHaveBeenCalled();
    expect(onLayout).toHaveBeenCalled();
    const outer = screen.getByTestId('row').parent;
    expect(JSON.stringify(outer?.props.style ?? null)).toContain('"flexGrow":0');
  });
});
