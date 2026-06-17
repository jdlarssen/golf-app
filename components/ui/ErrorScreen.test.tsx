import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorScreen } from './ErrorScreen';

// next-intl er globalt mocket mot ekte no.json i vitest.setup.ts, så
// `useTranslations('error')` resolver mot katalogen — ingen provider trengs.
describe('ErrorScreen', () => {
  it('rendrer lokalisert overskrift og kaller retry når «Prøv igjen» trykkes', () => {
    const retry = vi.fn();
    render(
      <ErrorScreen
        error={new Error('boom')}
        retry={retry}
        back={{ href: '/', labelKey: 'toHome' }}
        context="test"
      />,
    );

    // Bevis at i18n-wiringen rendrer ekte tekst, ikke en rå nøkkel.
    expect(screen.getByText('Noe gikk galt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
