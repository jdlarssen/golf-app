import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpectateCta } from './SpectateCta';

// SmartLink → next/link → useRouter for prefetch.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: () => {} }),
}));

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

describe('SpectateCta', () => {
  afterEach(clearCookies);

  it('viser CTA-en når ingen Supabase-sesjonscookie finnes (uinnlogget besøkende)', () => {
    clearCookies();
    render(<SpectateCta href="/no/login" label="Lag din egen turnering gratis" />);
    const cta = screen.getByTestId('spectate-cta');
    expect(cta.getAttribute('href')).toBe('/no/login');
    expect(cta.textContent).toBe('Lag din egen turnering gratis');
  });

  it('skjuler CTA-en når en sb-sesjonscookie finnes (innlogget bruker)', () => {
    document.cookie = 'sb-access-token=abc123';
    render(<SpectateCta href="/no/login" label="Lag din egen turnering gratis" />);
    expect(screen.queryByTestId('spectate-cta')).toBeNull();
  });
});
