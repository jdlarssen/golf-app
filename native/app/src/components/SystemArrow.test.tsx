// withSystemArrows (Type B): «→» tegnes med systemfonten i tekstens vekt, som
// i designet (#2385), og teksten er den samme for øyet og skjermleseren.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { withSystemArrows } from './SystemArrow';

describe('withSystemArrows', () => {
  it('lar en tekst uten pil være som den er', () => {
    expect(withSystemArrows('Vis færre', '500')).toBe('Vis færre');
  });

  it('tegner pila med systemfonten i tekstens vekt, og teksten er hel', async () => {
    await render(<Text testID="label">{withSystemArrows('Fortsett på hull 8 →', '600')}</Text>);
    expect(screen.getByTestId('label')).toHaveTextContent('Fortsett på hull 8 →');
    const arrow = screen.getByText('→');
    expect(StyleSheet.flatten(arrow.props.style)).toEqual({ fontFamily: 'System', fontWeight: '600' });
  });
});
