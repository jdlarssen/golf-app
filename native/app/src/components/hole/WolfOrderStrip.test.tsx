// #2314 — Type C: stripa tegner kolonnene `wolfOrderStrip` regnet ut, og
// regel-linja bare når den finnes. Regnestykket selv står i wolfHole.test.ts.
import { render, screen } from '@testing-library/react-native';
import { WolfOrderStrip } from './WolfOrderStrip';

describe('WolfOrderStrip', () => {
  it('tegner fire kolonner med hull og navn, og hele teksten for VoiceOver', async () => {
    await render(
      <WolfOrderStrip
        strip={{
          columns: [
            { hole: 15, label: 'Deg', isMine: true, accessibilityLabel: 'Hull 15: Deg' },
            { hole: 16, label: 'Marte', isMine: false, accessibilityLabel: 'Hull 16: Marte' },
            {
              hole: 17,
              label: 'Avgjøres',
              isMine: false,
              accessibilityLabel: 'Hull 17: avgjøres etter hull 16',
            },
            {
              hole: 18,
              label: 'Avgjøres',
              isMine: false,
              accessibilityLabel: 'Hull 18: avgjøres etter hull 17',
            },
          ],
          ruleLine:
            'Fra hull 17: ligger den som er sist, minst 4 poeng bak lederen, blir den ulv. Ellers går rundgangen videre.',
        }}
      />,
    );
    expect(screen.getByText('Wolf-rekkefølgen')).toBeTruthy();
    expect(screen.getByText('Hull 15')).toBeTruthy();
    expect(screen.getByText('Marte')).toBeTruthy();
    expect(screen.getAllByText('Avgjøres')).toHaveLength(2);
    expect(screen.getByTestId('wolf-order-17').props.accessibilityLabel).toBe(
      'Hull 17: avgjøres etter hull 16',
    );
    expect(screen.getByTestId('wolf-order-rule').props.children).toMatch(/^Fra hull 17: /);
  });

  it('uten regel-linje står bare kolonnene', async () => {
    await render(
      <WolfOrderStrip
        strip={{
          columns: [{ hole: 3, label: 'Per', isMine: false, accessibilityLabel: 'Hull 3: Per' }],
          ruleLine: null,
        }}
      />,
    );
    expect(screen.queryByTestId('wolf-order-rule')).toBeNull();
  });
});
