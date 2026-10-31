import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HandicapChip } from './HandicapChip';
import { HANDICAP_STALENESS_MS } from '@/lib/handicap/staleness';

const FRESH = new Date(Date.now() - 60_000).toISOString();
const STALE = new Date(Date.now() - HANDICAP_STALENESS_MS - 60_000).toISOString();

describe('HandicapChip', () => {
  it('renders the HCP label and value with Norwegian decimal comma', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('HCP')).toBeInTheDocument();
    expect(screen.getByText('18,4')).toBeInTheDocument();
  });

  it('formats whole numbers with one decimal', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={5} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('5,0')).toBeInTheDocument();
  });

  it('formats the default 54.0 cleanly', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={54} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('54,0')).toBeInTheDocument();
  });

  it('links to /profile with the encoded next path', () => {
    render(
      <HandicapChip
        name="Sigrid"
        hcpIndex={18.4}
        handicapUpdatedAt={FRESH}
        nextPath="/games/abc-123"
      />,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/profile?next=%2Fgames%2Fabc-123');
  });

  it('uses the neutral border + text color when fresh', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('border-border');
    const value = screen.getByText('18,4');
    expect(value.className).toContain('text-text');
    expect(value.className).not.toContain('text-accent');
  });

  it('switches to accent styling when stale', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={STALE} nextPath="/" />,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('border-accent');
    const value = screen.getByText('18,4');
    // Ringen er dekor (--accent), tallet bruker lesbar tekst-token (#1374).
    expect(value.className).toContain('text-accent-text');
  });

  it('has an accessible label describing the action', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(
      screen.getByRole('link', { name: /Handicap 18,4.*oppdatere/i }),
    ).toBeInTheDocument();
  });

  it('shows the first name before the HCP, so the pill reads «Sigrid · HCP 18,4»', () => {
    render(
      <HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    const link = screen.getByRole('link');
    expect(link.textContent).toBe('Sigrid·HCP18,4');
  });

  it('without a handicap the link shows just the name and still opens the profile', () => {
    render(<HandicapChip name="Sigrid" hcpIndex={null} nextPath="/" />);
    const link = screen.getByRole('link', { name: /Profil for Sigrid/ });
    expect(link.textContent).toBe('Sigrid');
    expect(link.getAttribute('href')).toBe('/profile?next=%2F');
    expect(screen.queryByText('HCP')).toBeNull();
  });

  it('without the update date it also falls back to the name-only link', () => {
    render(<HandicapChip name="Sigrid" hcpIndex={18.4} handicapUpdatedAt={null} nextPath="/" />);
    expect(screen.getByRole('link').textContent).toBe('Sigrid');
  });
});
