import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // #2457: premiebordet er lukket når det ikke finnes premier.
    fireEvent.click(screen.getByTestId('prizes-toggle'));

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

// #2457: Type B — premiebordet er en rad som åpner bordet. Lukket som standard
// (ni av ti ganger er det ikke noe premiebord), åpent når spillet alt har
// premier, og verdiene ligger i `prizeDraft` uansett om bordet er åpent.
describe('PrizesSection som rad som åpner premiebordet (#2457)', () => {
  it('er lukket som standard: raden har aria-expanded=false og ingen felt', () => {
    render(<PrizesSection state={makeState(emptyPrizeDraft())} />);

    const toggle = screen.getByTestId('prizes-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName(/premiebord/i);
    expect(toggle).toHaveClass('min-h-11');
    expect(screen.queryByTestId('prize-placement_1-desc')).toBeNull();
    expect(toggle).toHaveAttribute('aria-controls');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeNull();
  });

  it('åpnes og lukkes ved trykk, og aria-controls peker på feltene', () => {
    render(<PrizesSection state={makeState(emptyPrizeDraft())} />);
    const toggle = screen.getByTestId('prizes-toggle');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('prize-placement_1-desc')).toBeInTheDocument();
    expect(
      document.getElementById(toggle.getAttribute('aria-controls')!)?.contains(
        screen.getByTestId('prize-placement_1-desc'),
      ),
    ).toBe(true);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('prize-placement_1-desc')).toBeNull();
  });

  it('starter åpent når det finnes premier, og raden sier hvor mange når den lukkes', () => {
    const filled = emptyPrizeDraft();
    filled.placement_1 = { description: 'Gavekort', sponsor: '', sponsorLogoPath: '' };
    filled.placement_2 = { description: 'Ball-pakke', sponsor: '', sponsorLogoPath: '' };
    render(<PrizesSection state={makeState(filled)} />);

    const toggle = screen.getByTestId('prizes-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('prize-placement_1-desc')).toHaveValue('Gavekort');

    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('2 premier');
    // Premiene ligger i state, ikke i feltene, så de er ikke borte.
    expect(filled.placement_1.description).toBe('Gavekort');
  });

  it('skriver premien til state', () => {
    const state = makeState(emptyPrizeDraft());
    render(<PrizesSection state={state} />);
    fireEvent.click(screen.getByTestId('prizes-toggle'));

    fireEvent.change(screen.getByTestId('prize-placement_1-desc'), { target: { value: 'Middag' } });

    expect(state.setPrizeField).toHaveBeenCalledWith('placement_1', 'description', 'Middag');
  });
});
