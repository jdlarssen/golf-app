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
const toggleActiveMock = vi.fn<(fd: FormData) => Promise<void>>(
  async () => undefined,
);

vi.mock('./actions', () => ({
  toggleVisibility: (fd: FormData) => toggleVisibilityMock(fd),
  togglePrimary: (fd: FormData) => togglePrimaryMock(fd),
  toggleActive: (fd: FormData) => toggleActiveMock(fd),
}));

// Navn rendres fra modes.*-katalogen (i18n Fase D, #592) — vitest-stubben
// resolver mot no.json, så assertene under treffer ekte norske navn.
const FORMATS: FormatWithMappings[] = [
  {
    slug: 'stableford',
    icon_key: 'stableford',
    is_active: true,
    mappings: {
      kompis: { is_visible: true, is_primary: true, sort_order: 10 },
      klubb: { is_visible: true, is_primary: true, sort_order: 10 },
      solo: { is_visible: true, is_primary: true, sort_order: 10 },
    },
  },
  {
    slug: 'best_ball',
    icon_key: 'best_ball',
    is_active: true,
    mappings: {
      kompis: { is_visible: true, is_primary: true, sort_order: 20 },
      klubb: { is_visible: true, is_primary: true, sort_order: 20 },
      solo: null,
    },
  },
  {
    slug: 'singles_matchplay',
    icon_key: 'singles_matchplay',
    is_active: true,
    mappings: {
      kompis: { is_visible: true, is_primary: false, sort_order: 40 },
      klubb: null,
      solo: null,
    },
  },
];

describe('FormatsManager', () => {
  it('rendrer matrix + tab-layout og caller riktig action ved toggle', () => {
    const { container } = render(<FormatsManager initialFormats={FORMATS} />);

    // Desktop matrix er i DOM-en (selv om hidden via CSS i tester) —
    // verifiserer at format-radene rendres (én rad per format, men også
    // duplisert i mobile tabs siden begge layouts er i DOM samtidig).
    expect(screen.getAllByText('Stableford').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Best ball').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Matchplay').length).toBeGreaterThan(0);

    // Status-chip per format. Stableford er aktiv → «Aktiv».
    const statusChips = screen.getAllByLabelText(/Status: Aktiv/i);
    expect(statusChips.length).toBeGreaterThan(0);

    // #2337: the cup toggle changed nothing and is gone, on desktop and mobile.
    expect(screen.queryByRole('columnheader', { name: 'Cup' })).toBeNull();
    // The mobile cup list was the page's only <details> section.
    expect(container.querySelector('details')).toBeNull();

    // Klikk på primary-stjernen for best_ball/solo (i matrix). best_ball
    // har mapping=null for solo → primary er false. Klikk skal sende
    // intent=solo, next=on.
    const primaryButtons = screen.getAllByLabelText(/Best ball primær for Solo/i);
    fireEvent.click(primaryButtons[0]);
    expect(togglePrimaryMock).toHaveBeenCalled();
    const primaryFd = togglePrimaryMock.mock.calls[0]![0] as FormData;
    expect(primaryFd.get('format_slug')).toBe('best_ball');
    expect(primaryFd.get('intent')).toBe('solo');
    expect(primaryFd.get('next')).toBe('on');
  });
});
