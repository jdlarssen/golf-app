// KickerHeader (Type C): toppen er designets egen rad (#2385, «Felles topp»),
// ikke iOS sin navigasjonslinje. Her låses at raden bruker det native-stack
// gir den: pila bare når det finnes en skjerm bak, og skjermens egen
// `headerRight` i høyre boks. Og raden med bare pil (Profil), med designets
// etikett der den finnes.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { kickerHeader } from './KickerHeader';

jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

function headerElement(
  canGoBack: boolean,
  goBack: jest.Mock,
  base = kickerHeader('Mitt scorekort', 'Scorekort'),
) {
  const options = { ...base, headerRight: () => <Text>Del</Text> };
  return options.header!({
    back: canGoBack ? { title: 'Hjem', href: undefined } : undefined,
    options,
    route: { key: 'scorecard', name: 'Scorecard' },
    navigation: { goBack } as unknown as NativeStackHeaderProps['navigation'],
  });
}

it('pila går tilbake, ordet er overskriften, og høyre-knappen står i raden; uten skjerm bak er det ingen pil', async () => {
  const goBack = jest.fn();
  const { rerender } = await render(<>{headerElement(true, goBack)}</>);

  await fireEvent.press(screen.getByLabelText('Tilbake'));
  expect(goBack).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('header', { name: 'Mitt scorekort' })).toBeTruthy();
  expect(within(screen.getByTestId('kicker-top-bar-right')).getByText('Del')).toBeTruthy();

  await rerender(<>{headerElement(false, goBack)}</>);
  expect(screen.queryByTestId('header-back')).toBeNull();
});

it('uten ord er raden bare pila, og pila bærer designets etikett', async () => {
  await render(
    <>{headerElement(true, jest.fn(), kickerHeader('', 'Profil', { backLabel: 'Tilbake til profil' }))}</>,
  );
  expect(screen.getByLabelText('Tilbake til profil')).toBeTruthy();
  expect(screen.queryByRole('header')).toBeNull();
});
