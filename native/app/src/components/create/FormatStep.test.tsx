// #2928: «Prøv igjen» når formatlista ikke kom (Type C). Lenka er en ekte knapp
// med rollen button, når 44 pt med en usynlig utvidelse, og henter på nytt.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { INTER_LINE, TAP } from '../../theme';
import { FormatStep } from './FormatStep';

jest.mock('../../supabase', () => require('../../test/supabaseMock'));

describe('FormatStep', () => {
  it('«Prøv igjen» er en knapp på 44 pt som henter lista på nytt', async () => {
    const onRetry = jest.fn();
    await render(
      <FormatStep entries={null} failed selected={null} onSelect={jest.fn()} onRetry={onRetry} />,
    );
    const retry = screen.getByTestId('create-format-retry');
    expect(retry).toHaveProp('accessibilityRole', 'button');
    expect(within(retry).getByText('Prøv igjen')).toBeTruthy();
    // Inter 15 er 18,15 pt høy; resten er usynlig utvidelse over og under.
    const { top, bottom } = retry.props.hitSlop as { top: number; bottom: number };
    const size = StyleSheet.flatten(within(retry).getByText('Prøv igjen').props.style).fontSize as number;
    expect(top + size * INTER_LINE + bottom).toBeGreaterThanOrEqual(TAP);

    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
