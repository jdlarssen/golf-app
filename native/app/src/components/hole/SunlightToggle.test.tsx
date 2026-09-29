// #2252: den ene render-testen (Type C) for sollys-bryteren: rollen og
// merket skjermleseren leser, tilstanden, og at et trykk sendes videre.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SunlightToggle } from './SunlightToggle';

describe('SunlightToggle', () => {
  it('er en bryter merket «Sollysmodus» som viser om den er på', async () => {
    const onToggle = jest.fn();
    const { rerender } = await render(<SunlightToggle on={false} onToggle={onToggle} />);

    const toggle = screen.getByRole('switch', { name: 'Sollysmodus' });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    await rerender(<SunlightToggle on onToggle={onToggle} />);
    expect(screen.getByRole('switch', { name: 'Sollysmodus' })).toBeChecked();
  });
});
