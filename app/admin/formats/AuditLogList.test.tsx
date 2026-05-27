import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogList } from './AuditLogList';
import type { FormatAuditEntry } from '@/lib/formats/audit';

const ENTRIES: FormatAuditEntry[] = [
  {
    id: 'audit-1',
    actor_name: 'Jørgen',
    format_slug: 'best_ball',
    intent: 'klubb',
    change_type: 'primary',
    before: { is_primary: false },
    after: { is_primary: true },
    created_at: '2026-05-27T14:23:00Z',
  },
  {
    id: 'audit-2',
    actor_name: 'Jørgen',
    format_slug: 'fourball_matchplay',
    intent: null,
    change_type: 'cup_eligible',
    before: { is_cup_eligible: false },
    after: { is_cup_eligible: true },
    created_at: '2026-05-27T12:01:00Z',
  },
];

describe('AuditLogList', () => {
  it('rendrer 2 entries med korrekt change-label per type', () => {
    render(<AuditLogList entries={ENTRIES} />);

    // «Endringslogg» vises i både h2 og mobile-accordion-summary — bruk
    // role/heading for å disambiguere.
    expect(
      screen.getByRole('heading', { name: /Endringslogg \(siste 2\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/best_ball\/klubb → primary på/i)).toBeInTheDocument();
    expect(
      screen.getByText(/fourball_matchplay → cup-eligible på/i),
    ).toBeInTheDocument();

    // Begge entries refererer Jørgen — antall .font-semibold spans = 2.
    expect(screen.getAllByText('Jørgen').length).toBe(2);
  });

  it('viser empty-state når ingen entries', () => {
    render(<AuditLogList entries={[]} />);
    expect(screen.getByText(/ingen endringer logget ennå/i)).toBeInTheDocument();
  });
});
