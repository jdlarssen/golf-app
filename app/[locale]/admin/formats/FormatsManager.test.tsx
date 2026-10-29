import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FormatsManager } from './FormatsManager';
import type { FormatWithMappings, MappingEntry } from '@/lib/formats/types';

// Mock server-actions så vi kan spionere på FormData uten å trigge faktiske
// redirects/DB-kall.
const toggleVisibilityMock = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined);
const togglePrimaryMock = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined);
const toggleActiveMock = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined);
const moveFormatMock = vi.fn<(fd: FormData) => Promise<void>>(async () => undefined);

vi.mock('./actions', () => ({
  toggleVisibility: (fd: FormData) => toggleVisibilityMock(fd),
  togglePrimary: (fd: FormData) => togglePrimaryMock(fd),
  toggleActive: (fd: FormData) => toggleActiveMock(fd),
  moveFormat: (fd: FormData) => moveFormatMock(fd),
}));

const primary = (sort_order: number): MappingEntry => ({ is_visible: true, is_primary: true, sort_order });
const secondary = (sort_order: number): MappingEntry => ({ is_visible: true, is_primary: false, sort_order });
function fmt(slug: string, kompis: MappingEntry | null, is_active = true): FormatWithMappings {
  return { slug, icon_key: slug, is_active, mappings: { kompis, klubb: null, solo: null } };
}

// Navn rendres fra modes.*-katalogen — vitest-stubben resolver mot no.json.
// Input in slug order, as getAllFormatsWithMappings gives it; Kompis order
// below is the step-2 order.
const FORMATS: FormatWithMappings[] = [
  fmt('best_ball', primary(1)),
  fmt('fourball_matchplay', secondary(100)),
  fmt('gruesome_matchplay', null),
  fmt('nassau', secondary(60)),
  fmt('nines', secondary(71)),
  fmt('patsome', secondary(100)),
  fmt('shamble', secondary(100)),
  fmt('singles_matchplay', secondary(40)),
  fmt('stableford', primary(2)),
  fmt('wolf', primary(1), false),
];

const names = (section: HTMLElement) =>
  within(section)
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('FormatsManager', () => {
  it('shows Kompis as step 2 does: «Vanligst», five of «Flere muligheter», hidden, and inactive behind the toggle', () => {
    render(<FormatsManager initialFormats={FORMATS} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Kompis', 'Klubb', 'Solo']);

    const vanligst = screen.getByRole('region', { name: 'Vanligst · 2' });
    expect(names(vanligst)).toEqual([
      expect.stringContaining("Best ball"),
      expect.stringContaining("Stableford"),
    ]);

    const flere = screen.getByRole('region', { name: 'Flere muligheter · 6' });
    expect(within(flere).getAllByRole('listitem')).toHaveLength(5);
    expect(within(flere).getAllByRole('listitem')[0]).toHaveTextContent('Matchplay');
    const showAll = within(flere).getByRole('button', { name: 'Vis alle 6' });
    expect(showAll).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(showAll);
    expect(within(flere).getAllByRole('listitem')).toHaveLength(6);
    expect(within(flere).getByRole('button', { name: 'Vis færre' })).toHaveAttribute('aria-expanded', 'true');

    const skjult = screen.getByRole('region', { name: 'Skjult for Kompis · 1' });
    expect(within(skjult).getByRole('switch')).toHaveAttribute('aria-checked', 'false');

    // Wolf is inactive: out of «Vanligst», and its group and chips only show
    // with «Vis inaktive».
    expect(screen.queryByRole('region', { name: /Inaktive/ })).toBeNull();
    expect(screen.queryAllByLabelText(/status:/)).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Vis inaktive'));
    const inaktive = screen.getByRole('region', { name: 'Inaktive · 1' });
    fireEvent.click(within(inaktive).getByLabelText(/Wolf, status: Inaktiv/));
    const activeFd = toggleActiveMock.mock.calls[0]![0];
    expect(activeFd.get('format_slug')).toBe('wolf');
    expect(activeFd.get('next')).toBe('on');
  });

  it('disables the arrow at each edge and moves a format with its intent and direction', () => {
    render(<FormatsManager initialFormats={FORMATS} />);

    expect(screen.getByRole('button', { name: 'Flytt Best ball opp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Flytt Stableford ned' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Flytt Best ball ned' }));
    const fd = moveFormatMock.mock.calls[0]![0];
    expect(fd.get('format_slug')).toBe('best_ball');
    expect(fd.get('intent')).toBe('kompis');
    expect(fd.get('direction')).toBe('down');
    expect(screen.getByText('Best ball er nå nr. 2 av 2')).toBeInTheDocument();
  });
});
