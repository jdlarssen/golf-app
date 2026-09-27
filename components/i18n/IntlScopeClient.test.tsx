import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTimeZone } from 'next-intl';
import { IntlScopeClient } from './IntlScopeClient';

// vitest.setup.ts stubs useTranslations with the whole catalog. This test needs
// the real hook, which reads the nearest provider's messages.
const { useTranslations } = await vi.importActual<typeof import('next-intl')>('next-intl');

/**
 * Type C (#2227): a route under `<IntlScope>` must see both the root
 * provider's namespaces and the scope's extra ones, with the time zone intact.
 */
function Probe() {
  const tLeaderboard = useTranslations('leaderboard.common');
  const tAdmin = useTranslations('admin.nav');
  return (
    <p data-testid="probe">
      {tLeaderboard('unknownPlayer')} | {tAdmin('klubbhus')} | {useTimeZone()}
    </p>
  );
}

describe('IntlScopeClient', () => {
  it('merges the extra namespaces into the parent messages and keeps the time zone', () => {
    render(
      <NextIntlClientProvider
        locale="no"
        timeZone="Europe/Oslo"
        messages={{ leaderboard: { common: { unknownPlayer: '(ukjent)' } } } as never}
      >
        <IntlScopeClient
          extra={{ admin: { nav: { klubbhus: 'Klubbhuset' } } } as never}
          locale="no"
          timeZone="Europe/Oslo"
        >
          <Probe />
        </IntlScopeClient>
      </NextIntlClientProvider>,
    );

    expect(screen.getByTestId('probe').textContent).toBe('(ukjent) | Klubbhuset | Europe/Oslo');
  });
});
