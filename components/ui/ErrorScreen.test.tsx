import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import noMessages from '@/messages/no.json';
import { ErrorScreen } from './ErrorScreen';

// next-intl er globalt mocket mot ekte no.json i vitest.setup.ts, så
// `useTranslations('error')` resolver mot katalogen — ingen provider trengs.
describe('ErrorScreen', () => {
  it('rendrer feilskjermen med skjult tre-scene og kaller retry når «Prøv igjen» trykkes', () => {
    const retry = vi.fn();
    render(
      <ErrorScreen
        error={new Error('boom')}
        retry={retry}
        back={{ href: '/', labelKey: 'toHome' }}
        context="test"
      />,
    );

    const screenRoot = screen.getByTestId('error-screen');
    expect(screenRoot.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(
      screen.getByRole('heading', { level: 1, name: noMessages.error.heading }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: noMessages.error.retry }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
