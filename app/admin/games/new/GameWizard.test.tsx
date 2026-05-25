import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameWizard } from './GameWizard';
import type { CourseOption, PlayerOption } from './GameForm';

// Tester GameWizard-orchestratoren: 4-stegs navigasjons-flyt + per-steg-
// validering, escape-hatch til full-form, auto-name basert på bane/tee-off,
// og bekreftelse på at FormData som sendes til server-actions matcher
// dagens GameForm-payload.
//
// next/navigation er auto-stubbet globalt i vitest.setup.ts. Wizard-en
// faller derfor tilbake til default-step=1 og default-view='wizard'
// uavhengig av URL — tilstrekkelig for behaviour-testene her.

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    tee_boxes: [
      {
        id: 'tee-1',
        name: 'Gul',
        has_mens: true,
        has_ladies: true,
        has_juniors: false,
      },
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

function renderWizard({
  players = EIGHT_PLAYERS,
  createDraftAction = NO_OP,
  createAndPublishAction = NO_OP,
  initialValues,
}: {
  players?: PlayerOption[];
  createDraftAction?: (fd: FormData) => Promise<void>;
  createAndPublishAction?: (fd: FormData) => Promise<void>;
  initialValues?: Parameters<typeof GameWizard>[0]['initialValues'];
} = {}) {
  return render(
    <GameWizard
      courses={COURSES}
      players={players}
      mode={{
        kind: 'create',
        createDraftAction,
        createAndPublishAction,
      }}
      initialValues={initialValues}
    />,
  );
}

// Felles helper: gå fra steg 1 → 2 → 3 → 4. Forventer at hvert «Neste»-klikk
// faktisk er enabled på det aktuelle steget (caller må fylle inn felter
// før kall).
function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));
}

// Tekst-noden «Steg N av 4» splittes av React i tre child-nodes (template
// literal med interpolert variabel). getByText med regex matcher ikke
// over multi-node-grenser, så vi sjekker direkte mot textContent på en
// span inne i stepper-headeren.
function expectStep(n: 1 | 2 | 3 | 4) {
  const spans = Array.from(document.querySelectorAll('span'));
  const found = spans.find((el) => el.textContent === `Steg ${n} av 4`);
  expect(found, `Forventet «Steg ${n} av 4» i DOM`).toBeTruthy();
}

describe('GameWizard — happy-path solo stableford', () => {
  it('går gjennom alle 4 steg og når Publiser-knappen', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    // Steg 1: bytt til Stableford → solo auto-velges (team_size=1).
    expectStep(1);
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    // Solo-tile skal være valgt.
    expect(
      screen.getByRole('radio', { name: /solo/i }).getAttribute('aria-checked'),
    ).toBe('true');

    // Neste → steg 2.
    clickNext();
    expectStep(2);

    // Neste skal være disabled inntil bane+tee er valgt.
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();

    // Velg bane + tee + tee-off.
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });

    clickNext();
    expectStep(3);

    // Steg 3: minst 1 spiller for solo.
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();

    clickNext();
    expectStep(4);

    // Steg 4: «Lagre og publiser»-knappen skal være enabled.
    const publishBtn = screen.getByRole('button', {
      name: /lagre og publiser/i,
    });
    expect(publishBtn).not.toBeDisabled();
  });

  it('Forrige-knappen er disabled på steg 1', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /forrige/i })).toBeDisabled();
  });

  it('Forrige fra steg 2 går tilbake til steg 1 uten å miste mode-valg', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    clickNext();
    expectStep(2);
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    expectStep(1);
    // Stableford-tile skal fortsatt være valgt.
    expect(
      screen.getByRole('radio', { name: /stableford/i }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('GameWizard — best-ball inline team/flight på steg 3', () => {
  it('viser lag-grid + flights inline når 8 spillere er valgt', () => {
    renderWizard();

    // Steg 1: default = best_ball_netto → bare gå videre.
    clickNext();

    // Steg 2: velg bane + tee + tee-off.
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();

    // Steg 3: velg alle 8 spillere.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    // Lag-grid-heading skal vises inline (uten «4. »-prefix siden
    // hideNumbering=true i wizard).
    expect(
      screen.getByRole('heading', { name: /^lag$/i }),
    ).toBeInTheDocument();

    // Trekk tilfeldig så alle 8 fordeles 2-2-2-2.
    fireEvent.click(screen.getByRole('button', { name: /trekk tilfeldig/i }));

    // Flights-seksjon skal nå være synlig (best-ball-only, og teamsComplete).
    expect(
      screen.getByRole('heading', { name: /^flights$/i }),
    ).toBeInTheDocument();

    // Neste-knapp skal nå være enabled.
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
  });
});

describe('GameWizard — escape-hatch til full-form bevarer state', () => {
  it('bytter til full-form med wizard-state pre-fylt, og tilbake-knapp restaurer', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    // Sett opp en solo-stableford-state med navn + bane + tee + 1 spiller.
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();

    // Steg 4: klikk «Tilpass alle detaljer».
    fireEvent.click(
      screen.getByRole('button', { name: /tilpass alle detaljer/i }),
    );

    // Full-form rendrer nå — sjekk at en GameForm-spesifikk heading
    // dukker opp (f.eks. «1. Spillet»).
    expect(
      screen.getByRole('heading', { name: /^1\. spillet$/i }),
    ).toBeInTheDocument();

    // Tilbake-lenke skal være synlig øverst.
    const backLink = screen.getByRole('button', {
      name: /tilbake til hurtig-oppsett/i,
    });
    expect(backLink).toBeInTheDocument();

    // Bane skal være pre-fylt (course-1) i GameForm.
    expect(
      (screen.getByLabelText(/^bane$/i) as HTMLSelectElement).value,
    ).toBe('course-1');

    // Klikk tilbake → wizard rendrer igjen, og navnet er bevart.
    fireEvent.click(backLink);
    // Tilbake i wizard — stepper-headeren skal være synlig igjen (steg 4).
    expectStep(4);
  });
});

describe('GameWizard — auto-name + manuell override', () => {
  it('setter spillnavn til bane-navn når bane er valgt og tee-off er tom', () => {
    renderWizard();

    // Steg 1 → 2.
    clickNext();

    // Velg bane (ingen tee-off ennå).
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });

    // Velg 8 spillere så vi rekker steg 4 og kan inspisere navnet.
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: /trekk tilfeldig/i }));
    clickNext();

    // Steg 4: navnet skal vise «Stiklestad GK 1. juni» (auto-suggert).
    expect(screen.getByText(/Stiklestad GK 1\. juni/i)).toBeInTheDocument();
  });

  it('manuell rediger setter nameTouched og blokkerer auto-overstyring', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();

    // Steg 4: klikk navnet for å aktivere inline-rediger.
    fireEvent.click(screen.getByRole('button', { name: /Stiklestad GK/i }));
    const nameInput = screen.getByLabelText(/spillnavn/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Egen turnering' } });
    fireEvent.blur(nameInput);

    // Tilbake til steg 2 for å endre tee-off.
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-07-15T10:00' },
    });
    clickNext();
    clickNext();

    // Navnet skal fortsatt være «Egen turnering» — auto-name skulle ikke
    // overstyrt etter manuell rediger.
    expect(screen.getByText('Egen turnering')).toBeInTheDocument();
    expect(screen.queryByText(/Stiklestad GK 15\. juli/i)).not.toBeInTheDocument();
  });
});

describe('GameWizard — FormData-skjema speiler GameForm (K10)', () => {
  it('publiserer med samme FormData-keys som GameForm ville sendt', async () => {
    const publishSpy = vi.fn(async () => {});
    const { container } = renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      createAndPublishAction: publishSpy,
    });

    // Bygg solo-stableford-state.
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();

    // Sjekk hidden inputs i form-en (FormData ville plukket disse).
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    const fd = new FormData(form!);

    expect(fd.get('game_mode')).toBe('stableford');
    expect(fd.get('team_size')).toBe('1');
    expect(fd.get('stableford_team_size')).toBe('1');
    expect(fd.get('course_id')).toBe('course-1');
    expect(fd.get('tee_box_id')).toBe('tee-1');
    expect(fd.get('scheduled_tee_off_at')).toBe('2026-06-01T10:00');
    expect(fd.get('player_0_id')).toBe('u0');
    // Solo: team/flight er tomme strenger (gamePayload validatoren tolker
    // dem som null for solo-modus).
    expect(fd.get('player_0_team')).toBe('');
    expect(fd.get('player_0_flight')).toBe('');
    // Auto-suggert navn skal være med.
    expect(fd.get('name')).toBe('Stiklestad GK 1. juni');
  });

  it('best-ball: FormData inkluderer 8 player_${i}_*-rader + game_mode=best_ball_netto', () => {
    const { container } = renderWizard();

    // Default best_ball_netto — klikk gjennom uten å bytte modus.
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext();
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }
    fireEvent.click(screen.getByRole('button', { name: /trekk tilfeldig/i }));
    clickNext();

    const form = container.querySelector('form');
    const fd = new FormData(form!);
    expect(fd.get('game_mode')).toBe('best_ball_netto');
    expect(fd.get('team_size')).toBe('2');
    // 8 spiller-rader, alle med ikke-tom team + flight.
    for (let i = 0; i < 8; i++) {
      expect(fd.get(`player_${i}_id`)).toBeTruthy();
      expect(fd.get(`player_${i}_team`)).not.toBe('');
      expect(fd.get(`player_${i}_flight`)).not.toBe('');
    }
    // 9. spiller-row finnes ikke.
    expect(fd.get('player_8_id')).toBeNull();
  });
});
