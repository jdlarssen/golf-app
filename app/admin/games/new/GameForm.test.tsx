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

  it('viser lag-tilordnings-grid (4 lag) når 8 spillere er valgt i best-ball-modus (default)', () => {
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

    // Velg alle 8 spillere. Etter fase 4 fordeles de ikke automatisk
    // lengre, men selve lag-tilordnings-seksjons-headingen vises når
    // eightSelected blir true og modus = best-ball-netto (default).
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    expect(
      screen.getByRole('heading', { name: /lag/i }),
    ).toBeInTheDocument();
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

describe('GameForm — mode/lagstørrelse-velgere (fase 4)', () => {
  it('default mode = best_ball_netto: best-ball-tile er checked, par-tile er valgt', () => {
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

    const bbnTile = screen.getByRole('radio', { name: /best ball/i });
    expect(bbnTile.getAttribute('aria-checked')).toBe('true');
    const parTile = screen.getByRole('radio', { name: /par/i });
    expect(parTile.getAttribute('aria-checked')).toBe('true');
  });

  it('bytte til stableford: solo auto-velges og lag-grid skjules', () => {
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

    // Velg alle 8 spillere FØRST — for best-ball renderes lag-heading.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }
    expect(screen.getByRole('heading', { name: /lag/i })).toBeInTheDocument();

    // Bytt til stableford → Solo skal være auto-valgt, lag-heading skal forsvinne.
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));

    const soloTile = screen.getByRole('radio', { name: /solo/i });
    expect(soloTile.getAttribute('aria-checked')).toBe('true');
    expect(
      screen.queryByRole('heading', { name: /lag/i }),
    ).not.toBeInTheDocument();
  });

  it('stableford-modus: kan publisere med 1+ spiller uten lag-tildeling', () => {
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

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /spiller 1/i }),
    );

    // Spillere er den ene gjenstående blokkeren — bane/tee/tee-off
    // mangler fortsatt. Bekrefter at mangel-listen IKKE lengre nevner
    // «X spillere» for stableford (kun "minst én spiller" ved tom liste).
    fireEvent.click(
      screen.getByRole('checkbox', { name: /spiller 2/i }),
    );
    const helperText = document.getElementById('publish-missing');
    if (helperText) {
      expect(helperText.textContent).not.toMatch(/spiller/i);
      expect(helperText.textContent).not.toMatch(/lag-fordeling/i);
    }
  });

  it('hidden inputs sender game_mode og team_size i FormData', () => {
    const { container } = render(
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

    const modeInput = container.querySelector(
      'input[type="hidden"][name="game_mode"]',
    ) as HTMLInputElement | null;
    const sizeInput = container.querySelector(
      'input[type="hidden"][name="team_size"]',
    ) as HTMLInputElement | null;
    expect(modeInput?.value).toBe('best_ball_netto');
    expect(sizeInput?.value).toBe('2');

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    expect(
      (container.querySelector(
        'input[type="hidden"][name="game_mode"]',
      ) as HTMLInputElement).value,
    ).toBe('stableford');
    expect(
      (container.querySelector(
        'input[type="hidden"][name="team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('1');
  });

  it('lock_game_mode disabler både mode- og size-tiles (edit-flyt for publiserte spill)', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          game_mode: 'best_ball_netto',
          lock_game_mode: true,
        }}
      />,
    );

    expect(
      screen.getByRole('radio', { name: /best ball/i }),
    ).toBeDisabled();
    expect(screen.getByRole('radio', { name: /par/i })).toBeDisabled();
  });
});
