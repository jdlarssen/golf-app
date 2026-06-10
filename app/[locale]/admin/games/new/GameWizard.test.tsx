import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameWizard } from './GameWizard';
import type { CourseOption, PlayerOption } from './GameForm';
import type {
  FormatForIntent,
  CupEligibleFormat,
} from '@/lib/formats/getFormatsForIntent';

// Tester GameWizard-orchestratoren etter F2-redesign (#272): 5-stegs
// navigasjons-flyt med intent-først, per-steg-validering, escape-hatch til
// full-form, auto-name basert på bane/tee-off, og bekreftelse på at FormData
// som sendes til server-actions matcher dagens GameForm-payload.
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
    gender: null,
    level: 'normal',
  };
}

const EIGHT_PLAYERS: PlayerOption[] = Array.from({ length: 8 }, (_, i) =>
  makePlayer(`u${i}`, `Spiller ${i + 1}`),
);

// Mini-katalog matchende migrasjon 0047 — kun nødvendige slugs for test-flyt.
function formatRow(
  slug: string,
  display_name: string,
  is_primary: boolean,
  sort_order: number,
): FormatForIntent {
  return {
    slug,
    display_name,
    icon_key: slug,
    short_description: `${display_name} test-beskrivelse`,
    is_primary,
    sort_order,
  };
}

const FORMATS_BY_INTENT = {
  kompis: [
    formatRow('stableford', 'Stableford', true, 10),
    formatRow('best_ball', 'Best ball', true, 20),
    formatRow('texas_scramble', 'Texas scramble', false, 30),
    formatRow('singles_matchplay', 'Matchplay', false, 40),
  ],
  klubb: [
    formatRow('stableford', 'Stableford', true, 10),
    formatRow('best_ball', 'Best ball', true, 20),
    formatRow('texas_scramble', 'Texas scramble', true, 30),
    formatRow('solo_strokeplay', 'Slagspill', true, 40),
  ],
  solo: [
    formatRow('stableford', 'Stableford', true, 10),
    formatRow('solo_strokeplay', 'Slagspill', true, 20),
  ],
};

const CUP_ELIGIBLE: CupEligibleFormat[] = [
  {
    slug: 'singles_matchplay',
    display_name: 'Matchplay',
    icon_key: 'singles_matchplay',
    short_description: '1v1, vinn flest hull.',
  },
  {
    slug: 'fourball_matchplay',
    display_name: 'Fourball matchplay',
    icon_key: 'fourball_matchplay',
    short_description: '2v2 best-ball matchplay.',
  },
];

const NO_OP = async () => {};

function renderWizard({
  players = EIGHT_PLAYERS,
  // #464: picker-kilden er venne-filtrert for kompis/cup. Default-test-spillerne
  // er arrangørens venner så de er valgbare i steg 4, slik de ville vært i bruk.
  friendPlayerIds = players.map((p) => p.id),
  createDraftAction = NO_OP,
  createAndPublishAction = NO_OP,
  initialValues,
}: {
  players?: PlayerOption[];
  friendPlayerIds?: string[];
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
      formatsByIntent={FORMATS_BY_INTENT}
      cupEligibleFormats={CUP_ELIGIBLE}
      friendPlayerIds={friendPlayerIds}
    />,
  );
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));
}

// «Steg N av 5» splittes av React i tre child-nodes. Sjekk via textContent.
function expectStep(n: 1 | 2 | 3 | 4 | 5) {
  const spans = Array.from(document.querySelectorAll('span'));
  const found = spans.find((el) => el.textContent === `Steg ${n} av 5`);
  expect(found, `Forventet «Steg ${n} av 5» i DOM`).toBeTruthy();
}

// Helper: klikk Kompis-intent og gå videre til steg 2.
function pickKompisIntent() {
  fireEvent.click(screen.getByRole('radio', { name: /kompis-runde/i }));
  clickNext();
}

// Helper: pluck stableford-format i step 2 (Kompis-katalog har stableford
// som primary).
function pickStablefordFormat() {
  fireEvent.click(screen.getByRole('radio', { name: /^stableford$/i }));
}

function pickBestBallFormat() {
  fireEvent.click(screen.getByRole('radio', { name: /^best ball$/i }));
}

describe('GameWizard — happy-path solo stableford', () => {
  it('går gjennom alle 5 steg og når Publiser-knappen', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    // Steg 1 (Arrangement): klikk Kompis.
    expectStep(1);
    pickKompisIntent();

    // Steg 2 (Format): velg stableford.
    expectStep(2);
    pickStablefordFormat();
    clickNext();

    // Steg 3 (Bane og tidspunkt): velg bane + tee + tee-off.
    expectStep(3);
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();
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

    // Steg 4 (Spillere).
    expectStep(4);
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
    clickNext();

    // Steg 5 (Klar): publiser-knappen skal være enabled.
    expectStep(5);
    const publishBtn = screen.getByRole('button', {
      name: /lagre og publiser/i,
    });
    expect(publishBtn).not.toBeDisabled();
  });

  it('Forrige-knappen er disabled på steg 1', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /forrige/i })).toBeDisabled();
  });

  it('Forrige fra steg 2 går tilbake til steg 1 og bevarer intent-valg', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    pickKompisIntent();
    expectStep(2);
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    expectStep(1);
    // Kompis-tile skal fortsatt være valgt.
    expect(
      screen.getByRole('radio', { name: /kompis-runde/i }).getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('GameWizard — #464 picker-kilde (kun venner)', () => {
  function goToPlayersStep() {
    pickKompisIntent(); // steg 1 → 2
    pickStablefordFormat();
    clickNext(); // steg 2 → 3
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext(); // steg 3 → 4
    expectStep(4);
  }

  it('kompis steg 4: venner er valgbare, fremmede er ikke', () => {
    const friend = makePlayer('f1', 'Venn Person');
    const stranger = makePlayer('s1', 'Fremmed Person');
    // Begge i rosteren, men kun vennen i friendPlayerIds — den fremmede skal
    // ikke dukke opp som valgbar checkbox (#464 headline-oppførsel).
    renderWizard({ players: [friend, stranger], friendPlayerIds: ['f1'] });

    goToPlayersStep();

    expect(
      screen.getByRole('checkbox', { name: /venn person/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /fremmed person/i }),
    ).toBeNull();
  });

  it('kompis steg 4 uten venner: viser «Legg til venner»-lenke', () => {
    const stranger = makePlayer('s1', 'Fremmed Person');
    renderWizard({ players: [stranger], friendPlayerIds: [] });

    goToPlayersStep();

    expect(
      screen.queryByRole('checkbox', { name: /fremmed person/i }),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: /legg til venner/i }),
    ).toBeInTheDocument();
  });
});

describe('GameWizard — best-ball inline team/flight på steg 4', () => {
  it('viser lag-grid + flights inline når 8 spillere er valgt', () => {
    renderWizard();

    pickKompisIntent(); // → steg 2
    pickBestBallFormat();
    clickNext(); // → steg 3

    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: '2026-06-01T10:00' },
    });
    clickNext(); // → steg 4

    // Velg alle 8 spillere.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    expect(
      screen.getByRole('heading', { name: /^lag$/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /trekk tilfeldig/i }));

    expect(
      screen.getByRole('heading', { name: /^flights$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #373: Kompis-intent teller-filter — én render/interaksjons-test
// ─────────────────────────────────────────────────────────────────────────

const FORMATS_BY_INTENT_WITH_NINES = {
  ...FORMATS_BY_INTENT,
  kompis: [
    formatRow('stableford', 'Stableford', true, 10),
    formatRow('best_ball', 'Best ball', true, 20),
    formatRow('nines', 'Nines', false, 71),
  ],
};

function renderWizardWithNines() {
  return render(
    <GameWizard
      courses={COURSES}
      players={EIGHT_PLAYERS}
      mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
      formatsByIntent={FORMATS_BY_INTENT_WITH_NINES}
      cupEligibleFormats={CUP_ELIGIBLE}
    />,
  );
}

describe('GameWizard — #373 Kompis teller-filter', () => {
  it('count=3 skjuler best_ball og viser nines i steg 2', () => {
    renderWizardWithNines();

    // Steg 1: velg Kompis
    fireEvent.click(screen.getByRole('radio', { name: /kompis-runde/i }));
    clickNext();

    // Steg 2: default er 4 spillere → best_ball passer (partall 2–8),
    // nines (nøyaktig 3) er filtrert bort fra start
    expect(screen.getByRole('radio', { name: /^best ball$/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^nines$/i })).not.toBeInTheDocument();

    // Trykk «Flere spillere» to ganger: → 6 (default 4 + 2)
    // Trykk «Færre spillere» tre ganger: → 3
    fireEvent.click(screen.getByRole('button', { name: /flere spillere/i }));
    fireEvent.click(screen.getByRole('button', { name: /flere spillere/i }));
    fireEvent.click(screen.getByRole('button', { name: /færre spillere/i }));
    fireEvent.click(screen.getByRole('button', { name: /færre spillere/i }));
    fireEvent.click(screen.getByRole('button', { name: /færre spillere/i }));

    // count=3: best_ball passer ikke (trenger partall ≥2), nines passer (nøyaktig 3)
    expect(screen.queryByRole('radio', { name: /^best ball$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^nines$/i })).toBeInTheDocument();

    // «Vis alle»-lenke viser alt igjen
    fireEvent.click(screen.getByRole('button', { name: /vis alle/i }));
    expect(screen.getByRole('radio', { name: /^best ball$/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^nines$/i })).toBeInTheDocument();
  });
});

describe('GameWizard — escape-hatch til full-form bevarer state', () => {
  it('bytter til full-form med wizard-state pre-fylt og tilbake-knapp restaurer', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    pickKompisIntent();
    pickStablefordFormat();
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

    // Steg 5: klikk «Tilpass alle detaljer».
    fireEvent.click(
      screen.getByRole('button', { name: /tilpass alle detaljer/i }),
    );

    expect(
      screen.getByRole('heading', { name: /^1\. spillet$/i }),
    ).toBeInTheDocument();

    const backLink = screen.getByRole('button', {
      name: /tilbake til hurtig-oppsett/i,
    });
    expect(backLink).toBeInTheDocument();
    expect(
      (screen.getByLabelText(/^bane$/i) as HTMLSelectElement).value,
    ).toBe('course-1');

    fireEvent.click(backLink);
    expectStep(5);
  });
});

describe('GameWizard — Påmelding-felter (#199)', () => {
  it('rendrer Påmelding-radioene med defaults invite_only + solo på steg 2 etter format', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();
    expect(
      screen.getByRole('radio', { name: /bare de jeg inviterer/i }),
    ).toBeChecked();
    expect(screen.getByRole('radio', { name: /^individuelt$/i })).toBeChecked();
  });

  it('disabler "lag"/"begge" når modus er stableford (solo-modus)', () => {
    renderWizard();
    pickKompisIntent();
    pickStablefordFormat();
    expect(screen.getByRole('radio', { name: /^lag$/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^begge$/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^individuelt$/i })).toBeChecked();
  });

  it('lar "lag" velges når modus er best_ball', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();
    const teamRadio = screen.getByRole('radio', { name: /^lag$/i });
    expect(teamRadio).not.toBeDisabled();
    fireEvent.click(teamRadio);
    expect(teamRadio).toBeChecked();
  });

  it('force-reseter registration_type til solo når admin bytter til en mode uten lag', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();
    fireEvent.click(screen.getByRole('radio', { name: /^lag$/i }));
    expect(screen.getByRole('radio', { name: /^lag$/i })).toBeChecked();
    pickStablefordFormat();
    expect(screen.getByRole('radio', { name: /^individuelt$/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^lag$/i })).toBeDisabled();
  });

  it('inkluderer registration_mode + registration_type i FormData', () => {
    const { container } = renderWizard();
    pickKompisIntent();
    pickBestBallFormat();

    let fd = new FormData(container.querySelector('form')!);
    expect(fd.get('registration_mode')).toBe('invite_only');
    expect(fd.get('registration_type')).toBe('solo');

    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));
    fd = new FormData(container.querySelector('form')!);
    expect(fd.get('registration_mode')).toBe('open');
  });

  it('viser at "Spillere" er valgfri når påmelding ikke er invite_only', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();
    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));
    clickNext(); // → steg 3 (Bane)
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    clickNext(); // → steg 4 (Spillere)
    expect(
      screen.getByText(/du kan også la spillerne melde seg på selv/i),
    ).toBeInTheDocument();
    const nextButton = screen.getByRole('button', { name: /^neste$/i });
    expect(nextButton).not.toBeDisabled();
  });
});

describe('GameWizard — FormData-skjema speiler GameForm (K10)', () => {
  it('publiserer med samme FormData-keys som GameForm ville sendt', async () => {
    const publishSpy = vi.fn(async () => {});
    const { container } = renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      createAndPublishAction: publishSpy,
    });

    pickKompisIntent();
    pickStablefordFormat();
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
    expect(fd.get('player_0_team')).toBe('');
    expect(fd.get('player_0_flight')).toBe('');
    expect(fd.get('name')).toBe('Stiklestad GK 1. juni');
  });

  it('best-ball: FormData inkluderer 8 player_${i}_*-rader + game_mode=best_ball', () => {
    const { container } = renderWizard();

    pickKompisIntent();
    pickBestBallFormat();
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
    expect(fd.get('game_mode')).toBe('best_ball');
    expect(fd.get('team_size')).toBe('2');
    for (let i = 0; i < 8; i++) {
      expect(fd.get(`player_${i}_id`)).toBeTruthy();
      expect(fd.get(`player_${i}_team`)).not.toBe('');
      expect(fd.get(`player_${i}_flight`)).not.toBe('');
    }
    expect(fd.get('player_8_id')).toBeNull();
  });
});

describe('GameWizard — Cup-intent flow', () => {
  it('rendrer CupSetup (lag-navn + points + multi-select) på steg 2 med intent=cup', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('radio', { name: /^cup$/i }));
    clickNext();

    // Wizard-en er nå i cup-creation-flyt: bare 2 steg vises, og CupSetup
    // sin form er på skjermen.
    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lag 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lag 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/point-mål/i)).toBeInTheDocument();
    // Multi-select for cup-eligible formats. Henter ved id-attributt fordi
    // /matchplay/-regex matcher to checkboxer (Matchplay + Fourball matchplay).
    const singlesCheckbox = document.getElementById(
      'cup_format_singles_matchplay',
    ) as HTMLInputElement;
    const fourballCheckbox = document.getElementById(
      'cup_format_fourball_matchplay',
    ) as HTMLInputElement;
    expect(singlesCheckbox).toBeChecked();
    expect(fourballCheckbox).toBeChecked();
    expect(screen.getByRole('button', { name: /opprett cup/i })).toBeInTheDocument();
  });
});
