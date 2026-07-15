import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrizesSection } from './PrizesSection';
import { emptyPrizeDraft, type PrizeDraft } from '@/lib/games/prizes';
import type { GameFormState } from '../useGameFormState';

// Én Type C render-test per docs/test-discipline.md — låser disclosure-gatingen
// fra #1141: sponsor-feltet og logo-opplasteren (#1052) vises kun når slotet
// har en premie-beskrivelse, så et tomt slot aldri tilbyr felt som serveren
// uansett beskjærer (silent data loss). Non-matchplay gameMode → podium-
// slottene rendres; setup-stubben (vitest.setup.ts) resolver useTranslations
// mot no.json.
function makeState(prizeDraft: PrizeDraft): GameFormState {
  return {
    gameMode: 'stableford',
    sideEnabled: false,
    sideLdCount: 0,
    sideCtpCount: 0,
    prizeDraft,
    setPrizeField: vi.fn(),
  } as unknown as GameFormState;
}

describe('PrizesSection sponsor disclosure (#1141)', () => {
  it('viser sponsor-felt og logo-opplaster kun når premie-beskrivelsen er fylt ut', () => {
    const empty = emptyPrizeDraft();
    const { rerender } = render(<PrizesSection state={makeState(empty)} />);

    // Tomt premie-felt: premie-inputen vises; sponsor-input og logo-opplaster
    // er ikke i DOM-en.
    expect(screen.getByTestId('prize-placement_1-desc')).toBeInTheDocument();
    expect(screen.queryByTestId('prize-placement_1-sponsor')).toBeNull();
    expect(screen.queryByTestId('prize-placement_1-logo-upload')).toBeNull();

    // Fyll premie-beskrivelsen → begge sponsor-feltene dukker opp.
    const filled = emptyPrizeDraft();
    filled.placement_1 = { description: 'Gavekort', sponsor: '', sponsorLogoPath: '' };
    rerender(<PrizesSection state={makeState(filled)} />);

    expect(screen.getByTestId('prize-placement_1-desc')).toBeInTheDocument();
    expect(screen.getByTestId('prize-placement_1-sponsor')).toBeInTheDocument();
    expect(screen.getByTestId('prize-placement_1-logo-upload')).toBeInTheDocument();
  });
});
