import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    // «Prøv igjen» er ekte tekst fra katalogen, så i18n-wiringen er bevist.

    fireEvent.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
