import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CoursesLedgerClient,
  type CoursesLedgerItem,
} from './CoursesLedgerClient';

const ITEMS: CoursesLedgerItem[] = [
  { id: 'a', name: 'Stiklestad GK', created_at: '2026-05-01T12:00:00Z', tee_count: 3 },
  { id: 'b', name: 'Trondheim GK', created_at: '2026-04-15T12:00:00Z', tee_count: 4 },
  { id: 'c', name: 'Sjø-bane Trondheim', created_at: '2026-03-10T12:00:00Z', tee_count: 2 },
];

describe('CoursesLedgerClient — søk', () => {
  it('viser alle baner som default når søk er tomt', () => {
    render(<CoursesLedgerClient items={ITEMS} />);
    expect(screen.getByText('Stiklestad GK')).toBeTruthy();
    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.getByText('Sjø-bane Trondheim')).toBeTruthy();
  });

  it('filtrerer ledger case-insensitivt på substring av navn', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'TRONDHEIM' } });

    expect(screen.getByText('Trondheim GK')).toBeTruthy();
    expect(screen.getByText('Sjø-bane Trondheim')).toBeTruthy();
    expect(screen.queryByText('Stiklestad GK')).toBeNull();
  });

  it('viser empty-state med søke-strengen når ingen baner matcher', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: 'xyz' } });

    expect(screen.getByText('Ingen baner matcher «xyz».')).toBeTruthy();
  });

  it('trimmer søk-input før filtrering', () => {
    render(<CoursesLedgerClient items={ITEMS} />);

    const input = screen.getByLabelText('Søk etter banenavn');
    fireEvent.change(input, { target: { value: '  stiklestad   ' } });

    expect(screen.getByText('Stiklestad GK')).toBeTruthy();
    expect(screen.queryByText('Trondheim GK')).toBeNull();
  });
});
