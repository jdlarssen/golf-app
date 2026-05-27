import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormatsManager } from './FormatsManager';
import type { FormatWithMappings } from '@/lib/formats/types';

// Mock server-actions så vi kan spionere på FormData uten å trigge faktiske
// redirects/DB-kall.
const toggleVisibilityMock = vi.fn<(fd: FormData) => Promise<void>>(
  async () => undefined,
);
const togglePrimaryMock = vi.fn<(fd: FormData) => Promise<void>>(
  async () => undefined,
);
const toggleCupEligibleMock = vi.fn<(fd: FormData) => Promise<void>>(
  async () => undefined,
);
const toggleActiveMock = vi.fn<(fd: FormData) => Promise<void>>(
  async () => undefined,
);

vi.mock('./actions', () => ({
  toggleVisibility: (fd: FormData) => toggleVisibilityMock(fd),
  togglePrimary: (fd: FormData) => togglePrimaryMock(fd),
  toggleCupEligible: (fd: FormData) => toggleCupEligibleMock(fd),
  toggleActive: (fd: FormData) => toggleActiveMock(fd),
}));

const FORMATS: FormatWithMappings[] = [
  {
    slug: 'stableford',
    display_name: 'Stableford',
    icon_key: 'stableford',
    short_description: 'Solo, poeng vs par.',
    is_active: true,
    is_cup_eligible: false,
    mappings: {
      kompis: { is_visible: true, is_primary: true, sort_order: 10 },
      klubb: { is_visible: true, is_primary: true, sort_order: 10 },
      solo: { is_visible: true, is_primary: true, sort_order: 10 },
    },
  },
  {
    slug: 'best_ball',
    display_name: 'Best ball',
    icon_key: 'best_ball',
    short_description: 'Lag à 2, beste netto per hull.',
    is_active: true,
    is_cup_eligible: false,
    mappings: {
      kompis: { is_visible: true, is_primary: true, sort_order: 20 },
      klubb: { is_visible: true, is_primary: true, sort_order: 20 },
      solo: null,
    },
  },
  {
    slug: 'singles_matchplay',
    display_name: 'Matchplay',
    icon_key: 'singles_matchplay',
    short_description: '1v1, vinn flest hull.',
    is_active: true,
    is_cup_eligible: true,
    mappings: {
      kompis: { is_visible: true, is_primary: false, sort_order: 40 },
      klubb: null,
      solo: null,
    },
  },
];

describe('FormatsManager', () => {
  it('rendrer matrix + tab-layout og caller riktig action ved toggle', () => {
    render(<FormatsManager initialFormats={FORMATS} />);

    // Desktop matrix er i DOM-en (selv om hidden via CSS i tester) —
    // verifiserer at format-radene rendres (én rad per format, men også
    // duplisert i mobile tabs siden begge layouts er i DOM samtidig).
    expect(screen.getAllByText('Stableford').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Best ball').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Matchplay').length).toBeGreaterThan(0);

    // Status-chip per format. Stableford er aktiv → «Aktiv».
    const statusChips = screen.getAllByLabelText(/Status: Aktiv/i);
    expect(statusChips.length).toBeGreaterThan(0);

    // Klikk på «Cup-eligible»-checkbox for stableford (matrix-versjon).
    // Bruker eksplisitt aria-label for å unngå at /matchplay/-regex matcher
    // singles_matchplay sin Cup-checkbox.
    const cupCheckboxes = screen.getAllByLabelText(/Stableford cup-eligible/i);
    expect(cupCheckboxes[0]).not.toBeChecked();
    fireEvent.click(cupCheckboxes[0]);
    expect(toggleCupEligibleMock).toHaveBeenCalled();
    const cupFd = toggleCupEligibleMock.mock.calls[0]![0] as FormData;
    expect(cupFd.get('format_slug')).toBe('stableford');
    expect(cupFd.get('next')).toBe('on');

    // Klikk på primary-stjernen for best_ball/solo (i matrix). best_ball
    // har mapping=null for solo → primary er false. Klikk skal sende
    // intent=solo, next=on.
    const primaryButtons = screen.getAllByLabelText(/Best ball Solo primary/i);
    fireEvent.click(primaryButtons[0]);
    expect(togglePrimaryMock).toHaveBeenCalled();
    const primaryFd = togglePrimaryMock.mock.calls[0]![0] as FormData;
    expect(primaryFd.get('format_slug')).toBe('best_ball');
    expect(primaryFd.get('intent')).toBe('solo');
    expect(primaryFd.get('next')).toBe('on');
  });
});
