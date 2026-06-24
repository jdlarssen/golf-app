import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideCategoriesPicker } from './SideCategoriesPicker';
import { CLASSIC_DISABLED_CATEGORIES } from '@/lib/scoring/sideTournamentConfig';

// #909: katalogen (~40 kategorier) er kollapset bak forhåndsvalgene og brettes
// ut først når «Egendefinert» er aktiv. Det kritiske er at hidden input-ene
// (`side_disabled_categories`) rendres uansett synlighet, så kollaps ikke
// dropper form-data. Komponenten bruker ingen i18n — ren render holder.
describe('SideCategoriesPicker — auto-collapse (#909)', () => {
  it('full pakke (default): katalogen er kollapset, og «Egendefinert» bretter den ut', () => {
    render(<SideCategoriesPicker />);

    // Kollapset: ingen kategori-checkboxer rendret (kun preset-chips, som er
    // knapper, ikke checkboxer).
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    // Klikk «Egendefinert» → katalogen brettes ut.
    fireEvent.click(screen.getByRole('button', { name: /egendefinert/i }));
    expect(screen.queryAllByRole('checkbox').length).toBeGreaterThan(0);
  });

  it('klassisk (default): katalogen er kollapset MEN hidden input-ene rendres (form-data bevart)', () => {
    const { container } = render(
      <SideCategoriesPicker defaultDisabledCategories={CLASSIC_DISABLED_CATEGORIES} />,
    );

    // Kollapset (klassisk ≠ egendefinert): ingen synlige kategori-checkboxer.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    // Men hidden input-ene for de slått-av kategoriene er i DOM — ett per
    // kategori — så et kollapset panel ikke endrer hva som sendes ved submit.
    const hidden = container.querySelectorAll(
      'input[type="hidden"][name="side_disabled_categories"]',
    );
    expect(hidden.length).toBe(CLASSIC_DISABLED_CATEGORIES.length);
  });
});
