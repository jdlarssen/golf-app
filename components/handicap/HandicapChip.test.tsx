import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HandicapChip } from './HandicapChip';
import { HANDICAP_STALENESS_MS } from '@/lib/handicap/staleness';

const FRESH = new Date(Date.now() - 60_000).toISOString();
const STALE = new Date(Date.now() - HANDICAP_STALENESS_MS - 60_000).toISOString();

describe('HandicapChip', () => {
  it('renders the HCP label and value with Norwegian decimal comma', () => {
    render(
      <HandicapChip hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('HCP')).toBeInTheDocument();
    expect(screen.getByText('18,4')).toBeInTheDocument();
  });

  it('formats whole numbers with one decimal', () => {
    render(
      <HandicapChip hcpIndex={5} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('5,0')).toBeInTheDocument();
  });

  it('formats the default 54.0 cleanly', () => {
    render(
      <HandicapChip hcpIndex={54} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(screen.getByText('54,0')).toBeInTheDocument();
  });

  it('links to /profile with the encoded next path', () => {
    render(
      <HandicapChip
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
      <HandicapChip hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('border-border');
    const value = screen.getByText('18,4');
    expect(value.className).toContain('text-text');
    expect(value.className).not.toContain('text-accent');
  });

  it('switches to accent styling when stale', () => {
    render(
      <HandicapChip hcpIndex={18.4} handicapUpdatedAt={STALE} nextPath="/" />,
    );
    const link = screen.getByRole('link');
    expect(link.className).toContain('border-accent');
    const value = screen.getByText('18,4');
    expect(value.className).toContain('text-accent');
  });

  it('has an accessible label describing the action', () => {
    render(
      <HandicapChip hcpIndex={18.4} handicapUpdatedAt={FRESH} nextPath="/" />,
    );
    expect(
      screen.getByRole('link', { name: /Handicap 18,4.*oppdatere/i }),
    ).toBeInTheDocument();
  });
});
