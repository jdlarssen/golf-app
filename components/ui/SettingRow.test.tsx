import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SettingRow } from './SettingRow';

beforeEach(() => {
  cleanup();
});

describe('SettingRow', () => {
  it('rendrer href-variant som lenke med riktig mål', () => {
    render(<SettingRow href="/profile/historikk" label="Min historikk" />);
    const link = screen.getByRole('link', { name: /min historikk/i });
    expect(link).toHaveAttribute('href', '/profile/historikk');
  });

  it('rendrer onClick-variant som knapp og kaller handler', () => {
    const onClick = vi.fn();
    render(<SettingRow onClick={onClick} label="Installer app" />);
    fireEvent.click(screen.getByRole('button', { name: /installer app/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('danger-tone fargelegger label-en', () => {
    render(
      <SettingRow href="/profile/slett-konto" label="Slett konto" tone="danger" />,
    );
    expect(screen.getByText('Slett konto')).toHaveClass('text-danger-deep');
  });
});
