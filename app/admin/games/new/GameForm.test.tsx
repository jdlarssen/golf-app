import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GameForm, type CourseOption, type PlayerOption } from './GameForm';

// Pre-refactor regresjons-net for GameForm. Disse testene fanger dagens
// players-first-flow + best-ball-grid-default slik at vi vet om
// senere refaktorering (epic #41 fase 4) brekker eksisterende oppførsel.

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    tee_boxes: [
      { id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

function makePlayer(id: string, name: string, hcp: number = 18): PlayerOption {
  return {
    id,
    name,
    nickname: null,
    hcp_index: hcp,
    email: `${id}@example.com`,
    pending: false,
  };
}

const EIGHT_PLAYERS: PlayerOption[] = Array.from({ length: 8 }, (_, i) =>
  makePlayer(`u${i}`, `Spiller ${i + 1}`),
);

const NO_OP = async () => {};

describe('GameForm — baseline (pre-fase-4)', () => {
  it('rendrer spillere-seksjonen med spiller-checkbox-liste når availablePlayers har spillere', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
      />,
    );

    // Spiller-seksjons-heading. Bruk role+name for å unngå å matche
    // generelle «spillere»-strenger i annen UI-prosa.
    expect(
      screen.getByRole('heading', { name: /spillere/i }),
    ).toBeInTheDocument();

    // Alle 8 spillere skal vises som checkbox-rader.
    for (const player of EIGHT_PLAYERS) {
      expect(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      ).toBeInTheDocument();
    }
  });

  it('viser tomt-tilstand når ingen spillere er registrert', () => {
    render(
      <GameForm
        courses={COURSES}
        players={[]}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
      />,
    );

    expect(screen.getByText(/ingen registrerte spillere/i)).toBeInTheDocument();
  });

  it('viser lag-tilordnings-grid (4 lag) når 8 spillere er valgt — bekrefter dagens best-ball-flyt', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
      />,
    );

    // Velg alle 8 spillere — etter dagens auto-assign-logikk SKAL det vise
    // lag-grid-en. Etter fase 4 vil samme oppførsel gjelde for best-ball-
    // modusen (default), men spillerne fordeles ikke automatisk lengre.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    // Lag-headingen vises kun når 8 er valgt og modus krever det.
    expect(screen.getByText(/^lag$|3\. lag/i)).toBeInTheDocument();
  });

  it('viser «Publiser»-knapp som er disabled inntil hele flyten er gyldig', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
      />,
    );

    const publishBtn = screen.getByRole('button', { name: /publiser/i });
    expect(publishBtn).toBeDisabled();
  });

  it('caller togglePlayer-callback når en spiller velges (smoke-test for state-binding)', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: /spiller 1/i });
    fireEvent.click(checkbox);

    // Etter klikket skal valgte-spillere-listen rendres med chip-en for u0.
    const chipsList = screen.getByRole('list', { name: /valgte spillere/i });
    expect(within(chipsList).getByText(/spiller 1/i)).toBeInTheDocument();
  });
});
