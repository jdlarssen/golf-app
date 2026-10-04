import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { GameForm, type CourseOption, type PlayerOption } from './GameForm';
import { buildEditFormInitialValues, type EditGameRow } from '@/lib/games/editGameInitialValues';

// Pre-refactor regresjons-net for GameForm. Disse testene fanger dagens
// players-first-flow + best-ball-grid-default slik at vi vet om
// senere refaktorering (epic #41 fase 4) brekker eksisterende oppførsel.

// #928: tee-off 7 days out so the past-tee-off guard never rejects these
// fixtures. Computed relative to now so it can't go stale like a hard-coded date.
const FUTURE_TEE_OFF = (() => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

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
    gender: null,
    level: 'normal',
  };
}

const EIGHT_PLAYERS: PlayerOption[] = Array.from({ length: 8 }, (_, i) =>
  makePlayer(`u${i}`, `Spiller ${i + 1}`),
);

// #1379: create-actionene returnerer et resultat i stedet for å redirecte
// ved feil. `{ error: '' }` er «alt gikk bra»-formen.
const NO_OP = async () => ({ error: '' }) as const;

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

    // #909: seksjonen ligger nå i et Disclosure-panel; tittelen «Spillere» er
    // panel-tittel (span), ikke lenger en heading. Bekreft at panelet rendres.
    expect(screen.getByText('Spillere')).toBeInTheDocument();

    // Alle 8 spillere skal vises som checkbox-rader (i et lukket panel beholder
    // jsdom innholdet spørrbart).
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
  it('default mode = best_ball: best-ball-tile er checked, lagstørrelsen står som en linje', () => {
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

    const bbnTile = screen.getByRole('radio', { name: /best ball/i });
    expect(bbnTile.getAttribute('aria-checked')).toBe('true');
    // #2453: best ball har én lagstørrelse — en linje, ikke et kort å velge.
    expect(screen.getByTestId('team-size-line')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^par$/i })).not.toBeInTheDocument();
    expect(
      container.querySelector<HTMLInputElement>('input[type="hidden"][name="team_size"]')?.value,
    ).toBe('2');
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
    expect(modeInput?.value).toBe('best_ball');
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

  it('lock_game_mode viser read-only format-kort i stedet for ModeSelector-griden (#909)', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          game_mode: 'best_ball',
          lock_game_mode: true,
        }}
      />,
    );

    // Den fulle 13-korts ModeSelector-griden + TeamSizeSelector vises ikke når
    // modusen er låst — erstattet av et kompakt read-only kort.
    expect(
      screen.queryByRole('radio', { name: /best ball/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-size-line')).not.toBeInTheDocument();

    // Kortet viser format-navnet + låst-notisen.
    expect(screen.getByText('Best ball')).toBeInTheDocument();
    expect(
      screen.getByText(/kan ikke endres etter spill-start/i),
    ).toBeInTheDocument();

    // Form-data uendret: game_mode/team_size sendes fortsatt via hidden inputs.
    expect(
      (container.querySelector(
        'input[type="hidden"][name="game_mode"]',
      ) as HTMLInputElement).value,
    ).toBe('best_ball');
    expect(
      container.querySelector('input[type="hidden"][name="team_size"]'),
    ).not.toBeNull();
  });
});

describe('GameForm — par-stableford (epic #43 fase 2)', () => {
  /**
   * Helper: setter mode=stableford, deretter teamSize=2 i den rekkefølgen.
   * `handleModeChange` resetter teamSize til default-for-mode (stableford →
   * solo=1), så vi MÅ klikke Par-tile etter mode-byttet for å lande på
   * par-stableford.
   */
  function selectParStableford() {
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    // Stableford-familiens team_size-2-tile er merket «4BBB» (#282), ikke «Par».
    fireEvent.click(screen.getByRole('radio', { name: /4bbb/i }));
  }

  it('hidden input stableford_team_size = 2 når mode=stableford + par', () => {
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

    // Default: best_ball → ingen stableford_team_size-input.
    expect(
      container.querySelector(
        'input[type="hidden"][name="stableford_team_size"]',
      ),
    ).toBeNull();

    // Bytt til stableford (solo) → stableford_team_size=1.
    fireEvent.click(screen.getByRole('radio', { name: /stableford/i }));
    expect(
      (container.querySelector(
        'input[type="hidden"][name="stableford_team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('1');

    // Klikk 4BBB → stableford_team_size=2.
    fireEvent.click(screen.getByRole('radio', { name: /4bbb/i }));
    expect(
      (container.querySelector(
        'input[type="hidden"][name="stableford_team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('2');
    // team_size hidden input speiler også 2.
    expect(
      (container.querySelector(
        'input[type="hidden"][name="team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('2');
  });

  it('par-stableford: lag-grid vises når ≥2 spillere er valgt', () => {
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

    selectParStableford();

    // Med 0 spillere skal lag-headingen ikke vises ennå.
    expect(
      screen.queryByRole('heading', { name: /^lag$/i }),
    ).not.toBeInTheDocument();

    // Velg 2 spillere → lag-grid skal vises.
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    expect(
      screen.getByRole('heading', { name: /^lag$/i }),
    ).toBeInTheDocument();
    // Helper-tekst om par-à-2 + tomme lag skal være synlig.
    expect(screen.getByText(/inntil 20 lag à 2 spillere/i)).toBeInTheDocument();
  });

  it('par-stableford: «Trekk tilfeldig»-knappen vises (#2012)', () => {
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

    selectParStableford();
    // Fyll inn 8 spillere så grid + knapper kan rendres.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    expect(
      screen.getByRole('button', { name: /trekk tilfeldig/i }),
    ).toBeInTheDocument();
  });

  it('par-stableford: 4 spillere på 2 lag à 2 → canPublish true når øvrige felt er satt', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 4)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Par Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectParStableford();

    // Velg alle 4 spillere.
    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(`spiller ${i + 1}`, 'i') }),
      );
    }

    // Lag-grid skal nå være synlig. Selects er ikke labellet, så vi finner
    // dem direkte. Rutenettet viser lag nok til de valgte spillerne (#2148):
    // 4 spillere à 2 → lag 1 og 2.
    const teamSelects = Array.from(
      container.querySelectorAll<HTMLSelectElement>(
        'section select',
      ),
    ).filter((sel) =>
      Array.from(sel.options).some((o) => /tom plass/i.test(o.text)),
    );
    // Forventer 2 lag × 2 slots = 4 dropdowns.
    expect(teamSelects.length).toBe(4);

    // Tildel spiller 1 og 2 til lag 1 (slot 0 og 1), spiller 3 og 4 til lag 2.
    fireEvent.change(teamSelects[0], { target: { value: 'u0' } });
    fireEvent.change(teamSelects[1], { target: { value: 'u1' } });
    fireEvent.change(teamSelects[2], { target: { value: 'u2' } });
    fireEvent.change(teamSelects[3], { target: { value: 'u3' } });

    // Publiser-knappen skal være enabled.
    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).not.toBeDisabled();
  });

  it('par-stableford: 3 spillere (odd count) → canPublish false', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 4)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Par Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectParStableford();

    // Velg 3 spillere — odd count, kan ikke fordeles 2-2.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(`spiller ${i + 1}`, 'i') }),
      );
    }

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).toBeDisabled();

    // Mangel-listen skal nevne «partall» som hindringen.
    const helperText = document.getElementById('publish-missing');
    expect(helperText?.textContent).toMatch(/partall/i);
  });

  it('par-stableford: 4 spillere på samme lag (3 ekstra slots tomme) → canPublish false', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 4)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Par Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectParStableford();
    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(`spiller ${i + 1}`, 'i') }),
      );
    }

    // Forsøk å sette alle 4 spillere på lag 1 — assignPlayerToSlot bytter
    // dem mellom slots og over til andre lag, så vi simulerer 4-på-lag-1
    // ved å sette slot 0 og 1 på lag 1, og 0 og 1 på lag 2 til samme
    // spillere ... men assignPlayerToSlot flytter en spiller mellom lag.
    // I praksis er det ikke trivielt å lande i en «4 spillere på lag 1»-
    // state via UI-en — slot-occupant-cap-en gjør ulikevekt mer naturlig.
    //
    // Vi tester i stedet ulikevektsscenarioet: 2 spillere på lag 1 + 1
    // spiller på lag 2 + 1 ufordelt → ujevn fordeling skal blokkere publish.
    const teamSelects = Array.from(
      container.querySelectorAll<HTMLSelectElement>(
        'section select',
      ),
    ).filter((sel) =>
      Array.from(sel.options).some((o) => /tom plass/i.test(o.text)),
    );
    fireEvent.change(teamSelects[0], { target: { value: 'u0' } });
    fireEvent.change(teamSelects[1], { target: { value: 'u1' } });
    fireEvent.change(teamSelects[2], { target: { value: 'u2' } });
    // u3 er valgt men ikke tildelt — ujevn fordeling.

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).toBeDisabled();
    // Mangel-listen skal nevne lag-fordeling.
    const helperText = document.getElementById('publish-missing');
    expect(helperText?.textContent).toMatch(/lag-fordeling/i);
  });

  it('par-stableford: flight-seksjonen (lag-1+2 = flight-1) vises ikke', () => {
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

    selectParStableford();

    for (let i = 0; i < 4; i++) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(`spiller ${i + 1}`, 'i') }),
      );
    }
    const teamSelects = Array.from(
      container.querySelectorAll<HTMLSelectElement>(
        'section select',
      ),
    ).filter((sel) =>
      Array.from(sel.options).some((o) => /tom plass/i.test(o.text)),
    );
    fireEvent.change(teamSelects[0], { target: { value: 'u0' } });
    fireEvent.change(teamSelects[1], { target: { value: 'u1' } });
    fireEvent.change(teamSelects[2], { target: { value: 'u2' } });
    fireEvent.change(teamSelects[3], { target: { value: 'u3' } });

    // Ingen flight-heading skal være tilstede (par-stableford auto-mapper
    // flight = team).
    expect(
      screen.queryByRole('heading', { name: /^flights$/i }),
    ).not.toBeInTheDocument();
  });
});

describe('GameForm — patsome (#633)', () => {
  // Regresjonsvakt: Patsome er lag à 2 (som par-stableford), men lag-tildelings-
  // grid-en ble aldri wiret inn i TeamsAssignmentSection (#286 bygde scoring/
  // hull/leaderboard, men ikke veiviser-tildelingen). Uten grid var formatet
  // umulig å opprette. Én Type C render-test som beviser at grid-en rendrer.
  it('patsome: lag-grid vises når ≥2 spillere er valgt', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'patsome' }}
      />,
    );

    // Med 0 spillere skal lag-headingen ikke vises ennå.
    expect(
      screen.queryByRole('heading', { name: /^lag$/i }),
    ).not.toBeInTheDocument();

    // Velg 2 spillere → lag-grid skal vises (lag à 2-mønsteret).
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    expect(
      screen.getByRole('heading', { name: /^lag$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/inntil 20 lag à 2 spillere/i)).toBeInTheDocument();
  });
});

describe('GameForm — lag-matchplay (#634)', () => {
  // Regresjonsvakt: lag-matchplay (fourball/foursomes/greensome/chapman/
  // gruesome) er 2v2 — to «Side»-kort à 2 slots. Grid-en gjenbruker
  // lag-slot-maskineriet (samme path som Texas), men de fem formatene var
  // tidligere en dead-end uten side-grid. Én Type C render-test (fourball
  // representativt) beviser at side-grid-en rendrer, pluss en sjekk på at
  // Chapman fortsatt får sin allowance-toggle.
  it('fourball-matchplay: side-grid med to «Side»-kort à 2 slots vises når ≥2 spillere er valgt', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'fourball_matchplay' }}
      />,
    );

    // Velg 2 spillere → side-grid skal vises (2v2-mønsteret).
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // Beskrivelsen for lag-matchplay (to sider à 2).
    expect(screen.getByText(/to sider à 2 spillere/i)).toBeInTheDocument();

    // Eksakt to «Side N»-kort (lag 3/4 skjult for 2v2).
    expect(screen.getByText('Side 1')).toBeInTheDocument();
    expect(screen.getByText('Side 2')).toBeInTheDocument();
    expect(screen.queryByText('Side 3')).not.toBeInTheDocument();

    // Fire slot-dropdowns totalt (2 sider × 2 slots). Slot-selectene har
    // «— Tom plass —» som første opsjon; bane-/tee-selectene har det ikke,
    // så vi filtrerer på det for å telle kun grid-slottene.
    const slotSelects = Array.from(
      container.querySelectorAll('select'),
    ).filter((sel) => sel.querySelector('option')?.textContent === '— Tom plass —');
    expect(slotSelects).toHaveLength(4);
  });

  it('chapman-matchplay: allowance-toggle (chapman_allowance_pct) rendres', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'chapman_matchplay' }}
      />,
    );

    // AllowanceField for chapman skriver til chapman_allowance_pct via en
    // skjult input — bevis at feltet er montert (var manglende i veiviseren
    // før #634, så Chapman var uopprettelig).
    expect(
      container.querySelector('input[name="chapman_allowance_pct"]'),
    ).not.toBeNull();
  });
});

describe('GameForm — matchplay singles (epic #45 fase 2)', () => {
  /**
   * Helper: bytter til matchplay-modus via tile-klikk. Defensiv: ingen
   * teamSize-tile å klikke etterpå siden TeamSizeSelector skjules for
   * matchplay.
   */
  function selectMatchplay() {
    fireEvent.click(screen.getByRole('radio', { name: /matchplay/i }));
  }

  it('matchplay: TeamSizeSelector skjules helt', () => {
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

    // Default mode = best_ball → TeamSizeSelector synlig, som linja for én
    // lagstørrelse (#2453).
    expect(screen.getByTestId('team-size-line')).toBeInTheDocument();

    selectMatchplay();

    // Etter matchplay-valg skal TeamSizeSelector være borte.
    expect(screen.queryByTestId('team-size-line')).not.toBeInTheDocument();
  });

  it('matchplay: hidden inputs sender game_mode=singles_matchplay og team_size=1', () => {
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

    selectMatchplay();

    expect(
      (container.querySelector(
        'input[type="hidden"][name="game_mode"]',
      ) as HTMLInputElement).value,
    ).toBe('singles_matchplay');
    expect(
      (container.querySelector(
        'input[type="hidden"][name="team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('1');
    // stableford_team_size må IKKE være med i payloaden for matchplay
    // (den hører bare til stableford-modus).
    expect(
      container.querySelector(
        'input[type="hidden"][name="stableford_team_size"]',
      ),
    ).toBeNull();
  });

  it('matchplay: side-tilordnings-UI vises når ≥1 spiller er valgt', () => {
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

    selectMatchplay();

    // Med 0 spillere skal Sider-headingen ikke vises ennå.
    expect(
      screen.queryByRole('heading', { name: /^sider$/i }),
    ).not.toBeInTheDocument();

    // Velg én spiller → Sider-heading skal vises.
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    expect(
      screen.getByRole('heading', { name: /^sider$/i }),
    ).toBeInTheDocument();
    // Helper-tekst om 1v1 + tomme sider.
    expect(screen.getByText(/matchplay er 1v1/i)).toBeInTheDocument();
  });

  it('matchplay: lag-grid (4. Lag) og flight-seksjon vises ALDRI', () => {
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

    selectMatchplay();

    // Velg flere spillere (selv om matchplay capper på 2 — vi prøver
    // 3-klikk-flowen som via cap-en vil bli ignorert for de overskytende).
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // 4. Lag-heading (par-stableford/best-ball) skal ikke vises.
    expect(
      screen.queryByRole('heading', { name: /^lag$/i }),
    ).not.toBeInTheDocument();
    // 5. Flights-heading skal heller ikke vises.
    expect(
      screen.queryByRole('heading', { name: /^flights$/i }),
    ).not.toBeInTheDocument();
  });

  it('matchplay: «Trekk tilfeldig»-knappen skjules', () => {
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

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    expect(
      screen.queryByRole('button', { name: /trekk tilfeldig/i }),
    ).not.toBeInTheDocument();
  });

  it('matchplay: spiller-velgeren capper på 2 (3. spiller blir disabled)', () => {
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

    selectMatchplay();

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // Tredje spiller skal være disabled (cap-på-2-mekanikken).
    const spiller3 = screen.getByRole('checkbox', { name: /spiller 3/i });
    expect(spiller3).toBeDisabled();
  });

  it('matchplay: counter viser «X av 2 spillere valgt»', () => {
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

    selectMatchplay();
    // Med 0 valgte: «0 av 2 spillere valgt».
    expect(screen.getByText(/0 av 2 spillere valgt/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    // #2321: the count also stands in the SIDER kicker once a side shows.
    expect(screen.getAllByText(/1 av 2 spillere valgt/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));
    expect(screen.getAllByText(/2 av 2 spillere valgt/i).length).toBeGreaterThan(0);
  });

  it('matchplay: 2 spillere fordelt på Side 1 og Side 2 → canPublish=true', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Match Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectMatchplay();

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // To side-selects skal være tilgjengelige.
    const side1 = container.querySelector(
      '#matchplay_side_1',
    ) as HTMLSelectElement | null;
    const side2 = container.querySelector(
      '#matchplay_side_2',
    ) as HTMLSelectElement | null;
    expect(side1).not.toBeNull();
    expect(side2).not.toBeNull();

    fireEvent.change(side1!, { target: { value: 'u0' } });
    fireEvent.change(side2!, { target: { value: 'u1' } });

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).not.toBeDisabled();
  });

  it('matchplay: 1 spiller → canPublish=false + missingForPublish nevner «1 spiller til»', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Match Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).toBeDisabled();

    const helperText = document.getElementById('publish-missing');
    expect(helperText?.textContent).toMatch(/1 spiller til/i);
  });

  it('matchplay: 2 spillere begge på Side 1 → canPublish=false + missingForPublish nevner «hver side»', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Match Cup',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // Sett begge på Side 1 — assignPlayerToSide vil fjerne den første
    // når den andre velges siden hver side bare kan ha én okkupant.
    // Vi simulerer dette via dropdown-bytte: først u0 på side 1, så
    // bytter vi til u1 på side 1 → u0 mister side-tilordning.
    const side1 = container.querySelector(
      '#matchplay_side_1',
    ) as HTMLSelectElement;
    fireEvent.change(side1, { target: { value: 'u0' } });
    fireEvent.change(side1, { target: { value: 'u1' } });

    // Nå: u1 på side 1, u0 ufordelt, side 2 tom. Begge spillerne mangler
    // én-spiller-per-side-tilstand.
    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).toBeDisabled();

    const helperText = document.getElementById('publish-missing');
    // Med 2 spillere men ikke 1+1 på sidene melder vi "én spiller på hver side".
    expect(helperText?.textContent).toMatch(/én spiller på hver side/i);
  });

  it('matchplay: bytte til side via dropdown swapper okkupanter (idiomatic UX)', () => {
    const { container } = render(
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

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    const side1 = container.querySelector(
      '#matchplay_side_1',
    ) as HTMLSelectElement;
    const side2 = container.querySelector(
      '#matchplay_side_2',
    ) as HTMLSelectElement;

    // Initial: u0 til side 1, u1 til side 2.
    fireEvent.change(side1, { target: { value: 'u0' } });
    fireEvent.change(side2, { target: { value: 'u1' } });
    expect(side1.value).toBe('u0');
    expect(side2.value).toBe('u1');

    // Velg u1 på side 1 → swap: u0 flytter til side 2, u1 til side 1.
    fireEvent.change(side1, { target: { value: 'u1' } });
    expect(side1.value).toBe('u1');
    expect(side2.value).toBe('u0');
  });

  it('matchplay: hidden inputs har player_0_team=1 og player_1_team=2 etter side-tilordning', () => {
    const { container } = render(
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

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    const side1 = container.querySelector(
      '#matchplay_side_1',
    ) as HTMLSelectElement;
    const side2 = container.querySelector(
      '#matchplay_side_2',
    ) as HTMLSelectElement;
    fireEvent.change(side1, { target: { value: 'u0' } });
    // #2210: with only side 1 set, u1 rides along as a player without a side
    // instead of being dropped from the payload.
    const unassigned = () =>
      [
        ...container.querySelectorAll<HTMLInputElement>(
          'input[name="unassigned_player_id"]',
        ),
      ].map((el) => el.value);
    expect(unassigned()).toEqual(['u1']);
    fireEvent.change(side2, { target: { value: 'u1' } });
    expect(unassigned()).toEqual([]);

    // Payloaden skal ha player_0 (side 1) + player_1 (side 2) i den
    // rekkefølgen — orderedPayload itererer side 1 → side 2.
    const player0Id = container.querySelector(
      'input[type="hidden"][name="player_0_id"]',
    ) as HTMLInputElement | null;
    const player0Team = container.querySelector(
      'input[type="hidden"][name="player_0_team"]',
    ) as HTMLInputElement | null;
    const player0Flight = container.querySelector(
      'input[type="hidden"][name="player_0_flight"]',
    ) as HTMLInputElement | null;
    const player1Id = container.querySelector(
      'input[type="hidden"][name="player_1_id"]',
    ) as HTMLInputElement | null;
    const player1Team = container.querySelector(
      'input[type="hidden"][name="player_1_team"]',
    ) as HTMLInputElement | null;
    const player1Flight = container.querySelector(
      'input[type="hidden"][name="player_1_flight"]',
    ) as HTMLInputElement | null;

    expect(player0Id?.value).toBe('u0');
    expect(player0Team?.value).toBe('1');
    expect(player0Flight?.value).toBe('1');
    expect(player1Id?.value).toBe('u1');
    expect(player1Team?.value).toBe('2');
    expect(player1Flight?.value).toBe('2');
    // #2210: the create flow has no roster to diff against.
    expect(
      container.querySelector('input[name="roster_loaded_ids"]'),
    ).toBeNull();
  });

  it('matchplay: per-spiller-tee-seksjonen vises slik at admin kan sette M/D/J', () => {
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

    selectMatchplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // Per-spiller-tee-seksjons-heading med matchplay-nummerering (5).
    expect(
      screen.getByRole('heading', { name: /^tee per spiller$/i }),
    ).toBeInTheDocument();
  });
});

describe('GameForm — solo strokeplay (epic #46 fase 2)', () => {
  /**
   * Helper: bytter til solo strokeplay via tile-klikk. Speilar
   * `selectMatchplay`-mønstret men trenger ingen ekstra teamSize-tile-klikk
   * siden defaultTeamSizeForMode('solo_strokeplay') = 1 og Solo er
   * den eneste aktive lagstørrelsen for modusen.
   */
  function selectSoloStrokeplay() {
    fireEvent.click(screen.getByRole('radio', { name: /slagspill/i }));
  }

  it('slagspill: lagstørrelsen står som en linje (ingen Solo/Par/4-mann-fliser)', () => {
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

    selectSoloStrokeplay();

    // TeamSizeSelector skal være synlig (i motsetning til matchplay som
    // skjuler den helt). Slagspill har bare Solo, så den står som en linje
    // uten noe valg (#2453).
    expect(screen.getByTestId('team-size-line')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: /velg lagstørrelse/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^solo$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^par$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /4-mann/i })).not.toBeInTheDocument();
  });

  it('slagspill: hidden inputs sender game_mode=solo_strokeplay og team_size=1, ingen stableford_team_size', () => {
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

    selectSoloStrokeplay();

    expect(
      (container.querySelector(
        'input[type="hidden"][name="game_mode"]',
      ) as HTMLInputElement).value,
    ).toBe('solo_strokeplay');
    expect(
      (container.querySelector(
        'input[type="hidden"][name="team_size"]',
      ) as HTMLInputElement).value,
    ).toBe('1');
    // stableford_team_size må IKKE være med — det hører kun til stableford-modus.
    expect(
      container.querySelector(
        'input[type="hidden"][name="stableford_team_size"]',
      ),
    ).toBeNull();
  });

  it('slagspill: flat spiller-liste — lag-grid (4. Lag) og flight-seksjon vises ALDRI', () => {
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

    selectSoloStrokeplay();

    // Velg flere spillere — ingen lag-/flight-seksjon skal dukke opp uansett.
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 3/i }));

    expect(
      screen.queryByRole('heading', { name: /^lag$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /^flights$/i }),
    ).not.toBeInTheDocument();
  });

  it('slagspill: 1 spiller → canPublish=true når øvrige felter er satt', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          name: 'Klubbmesterskap',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectSoloStrokeplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).not.toBeDisabled();
  });

  it('slagspill: 0 spillere → canPublish=false + missingForPublish nevner «minst én spiller»', () => {
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
          name: 'Klubbmesterskap',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          hcp_allowance_pct: '100',
        }}
      />,
    );

    selectSoloStrokeplay();

    const publishBtn = screen.getByRole('button', { name: /^publiser$/i });
    expect(publishBtn).toBeDisabled();

    const helperText = document.getElementById('publish-missing');
    expect(helperText?.textContent).toMatch(/minst én spiller/i);
  });

  it('slagspill: per-spiller-tee-seksjonen vises (Tee per spiller) for HCP-allokering', () => {
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

    selectSoloStrokeplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    // Solo-modus bruker nummerering 4 (ingen 4. Lag-seksjon foran).
    expect(
      screen.getByRole('heading', { name: /^tee per spiller$/i }),
    ).toBeInTheDocument();
  });

  it('slagspill: ingen øvre spiller-cap — alle 8 spillere kan velges (i motsetning til matchplay som capper på 2)', () => {
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

    selectSoloStrokeplay();
    for (const player of EIGHT_PLAYERS) {
      const checkbox = screen.getByRole('checkbox', {
        name: new RegExp(player.name!, 'i'),
      });
      // Ingen checkbox skal være disabled (solo-modus har ingen cap).
      expect(checkbox).not.toBeDisabled();
      fireEvent.click(checkbox);
    }

    // Counter skal vise «8 spillere valgt» (#2321: also in the first kicker of the Inndeling panel).
    expect(screen.getAllByText(/8 spillere valgt/i).length).toBeGreaterThan(0);
  });

  it('slagspill: hidden inputs har player_${i}_id satt + player_${i}_team/flight tomme strenger', () => {
    const { container } = render(
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

    selectSoloStrokeplay();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));

    const player0Id = container.querySelector(
      'input[type="hidden"][name="player_0_id"]',
    ) as HTMLInputElement | null;
    const player0Team = container.querySelector(
      'input[type="hidden"][name="player_0_team"]',
    ) as HTMLInputElement | null;
    const player0Flight = container.querySelector(
      'input[type="hidden"][name="player_0_flight"]',
    ) as HTMLInputElement | null;
    const player1Id = container.querySelector(
      'input[type="hidden"][name="player_1_id"]',
    ) as HTMLInputElement | null;

    expect(player0Id?.value).toBe('u0');
    expect(player0Team?.value).toBe('');
    expect(player0Flight?.value).toBe('');
    expect(player1Id?.value).toBe('u1');
  });
});

describe('GameForm — setup-step-seksjoner (fix #322)', () => {
  it('wolf: WolfSetup vises med gross-radio checked når initialValues.wolf_scoring=gross', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          game_mode: 'wolf',
          wolf_scoring: 'gross',
        }}
      />,
    );

    // WolfSetup-seksjon skal vises.
    expect(screen.getByText(/wolf-oppsett/i)).toBeInTheDocument();

    // Gross-radio skal være checked (reflekterer pre-fylt initialValues).
    const grossRadio = container.querySelector(
      'input[type="radio"][name="wolf_scoring"][value="gross"]',
    ) as HTMLInputElement | null;
    expect(grossRadio).not.toBeNull();
    expect(grossRadio?.checked).toBe(true);

    // Net-radio skal ikke være checked.
    const netRadio = container.querySelector(
      'input[type="radio"][name="wolf_scoring"][value="net"]',
    ) as HTMLInputElement | null;
    expect(netRadio?.checked).toBe(false);
  });

  it('wolf: WolfSetup vises ikke når game_mode er best_ball', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'best_ball' }}
      />,
    );

    expect(screen.queryByText(/wolf-oppsett/i)).not.toBeInTheDocument();
  });

  it('round_robin: AllowanceField vises med pre-fylt allowance fra initialValues (#337)', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'round_robin', round_robin_allowance_pct: 50 }}
      />,
    );

    // Round Robin-scoring-seksjonen skal vises.
    expect(screen.getByText(/scoring for round robin/i)).toBeInTheDocument();

    // Hidden input skal bære pre-fylt verdi (50), ikke WHS-default (85).
    const hidden = container.querySelector(
      'input[name="round_robin_allowance_pct"]',
    ) as HTMLInputElement | null;
    expect(hidden).not.toBeNull();
    expect(hidden?.value).toBe('50');
  });

  it('round_robin: AllowanceField vises ikke når game_mode er best_ball', () => {
    render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'best_ball' }}
      />,
    );

    expect(screen.queryByText(/scoring for round robin/i)).not.toBeInTheDocument();
  });

  it('shamble: ShambleSetup vises med champagne-variant checked når initialValues.shamble_variant=champagne', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          game_mode: 'shamble',
          shamble_variant: 'champagne',
          shamble_count: 3,
          shamble_scoring: 'net',
          team_size: 4,
        }}
      />,
    );

    // ShambleSetup-seksjon skal vises.
    expect(screen.getByText(/shamble-oppsett/i)).toBeInTheDocument();

    // Champagne-radio skal være checked.
    const champagneRadio = container.querySelector(
      'input[type="radio"][name="shamble_variant"][value="champagne"]',
    ) as HTMLInputElement | null;
    expect(champagneRadio).not.toBeNull();
    expect(champagneRadio?.checked).toBe(true);
  });

  it('nassau: NassauSetup vises med net-radio checked (default)', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{ game_mode: 'nassau', nassau_scoring: 'net' }}
      />,
    );

    const netRadio = container.querySelector(
      'input[type="radio"][name="nassau_scoring"][value="net"]',
    ) as HTMLInputElement | null;
    expect(netRadio).not.toBeNull();
    expect(netRadio?.checked).toBe(true);
  });
});

describe('GameForm — kollapsbare paneler (#909)', () => {
  it('rendrer seksjonene som Disclosure-paneler', () => {
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

    // Panel-titlene rendres (Grunnoppsett åpent som default, resten kollapset).
    for (const title of [
      'Grunnoppsett',
      'Spillere',
      'Spillform',
      'Påmelding',
      'Innstillinger',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('form-data-invariant: kollapsede paneler beholder skjema-feltene i DOM', () => {
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

    // Selv om Spillform/Påmelding/Innstillinger er kollapset som default, må
    // feltene deres ligge i DOM så de sendes uendret ved submit (lukket
    // <details> beholder innholdet). Et utvalg sentrale felt-navn:
    for (const name of [
      'game_mode',
      'team_size',
      'registration_mode',
      'registration_type',
      'score_visibility',
      'side_tournament_enabled',
      'require_peer_approval',
    ]) {
      expect(container.querySelector(`[name="${name}"]`)).not.toBeNull();
    }
  });

  it('Inndeling-panelet vises kun når lag-/tee-tilordning har innhold', () => {
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

    // best_ball uten valgte spillere → ingen lag-/tee-innhold → intet panel.
    expect(screen.queryByText('Inndeling')).not.toBeInTheDocument();

    // Velg 2 spillere → lag-grid har innhold → «Inndeling»-panelet dukker opp.
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));
    expect(screen.getByText('Inndeling')).toBeInTheDocument();
  });
});

describe('GameForm — #1011 sideturnering serialiseres inline', () => {
  // GameForm har INGEN FormDataInputs-speiling (den er wizard-only) — edit-
  // flytene og full-form-escape-hatchen er avhengige av at AdvancedSettings-
  // Section selv emitter side_*-feltene. Regresjon: name-attributtene ble
  // droppet ubetinget i første #1011-runde og wipet sideturnering ved lagring.
  it('FormData fra GameForm har alle side_*-felter når initialValues har sideturnering', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{
          kind: 'create',
          createDraftAction: NO_OP,
          createAndPublishAction: NO_OP,
        }}
        initialValues={{
          game_mode: 'stableford',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          side_tournament_enabled: true,
          side_ld_count: 2,
          side_ctp_count: 1,
        }}
      />,
    );

    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('side_tournament_enabled')).toEqual(['true']);
    expect(fd.getAll('side_ld_count')).toEqual(['2']);
    expect(fd.getAll('side_ctp_count')).toEqual(['1']);
  });
});

describe('GameForm — startkontingenten sendes med (#2282)', () => {
  // Beløpet og Vipps-feltet har ikke `name` (veiviseren speiler dem i
  // FormDataInputs). GameForm hadde ingen speiling, så «Lagre endringer» på et
  // planlagt spill skrev 0 kr og tom lenke over det arrangøren hadde satt.
  it('FormData har entry_fee_kr og payment_link fra initialValues, én gang hver', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
        initialValues={{
          game_mode: 'stableford',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          entry_fee_kr: 200,
          payment_link: '12345',
        }}
      />,
    );
    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('entry_fee_kr')).toEqual(['200']);
    expect(fd.getAll('payment_link')).toEqual(['12345']);
  });
});

describe('GameForm — «Shotgun-start» (#2258)', () => {
  // The checkbox has no name; the always-mounted `start_type` mirror is the
  // one field the save reads, so an edit keeps a shotgun round a shotgun round.
  it.each([
    ['shotgun', true],
    [undefined, false],
  ] as const)('initial start_type %j → checkbox %s and FormData start_type', (startType, checked) => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
        initialValues={{ game_mode: 'stableford', course_id: 'course-1', tee_box_id: 'tee-1', start_type: startType }}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Shotgun-start' });
    expect((box as HTMLInputElement).checked).toBe(checked);
    expect(box).toHaveAccessibleDescription('Alle flightene starter samtidig, hver fra sitt eget hull.');
    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('start_type')).toEqual([startType ?? 'first_tee']);
    fireEvent.click(box);
    expect(new FormData(container.querySelector('form')!).getAll('start_type')).toEqual([
      checked ? 'first_tee' : 'shotgun',
    ]);
  });
});

describe('GameForm — #1379 mangel-tekst på edit-scheduled', () => {
  // Regresjon: `canPublish` deaktiverer også «Lagre endringer», men «Mangler:
  // …»-teksten lå inne i publiser/utkast-grenen. Et scheduled spill med en
  // mangel ga da en død knapp uten ett eneste hint om hvorfor. #2441: en
  // spiller uten fullført profil stopper ikke lenger knappen, så mangelen her
  // er en tom tee.
  const NO_OP_UPDATE = async () => {};

  it('lenker den deaktiverte lagre-knappen til mangel-teksten', () => {
    const firstPlayer = makePlayer('u-first', 'Første Spiller');

    const { container, rerender } = render(
      <GameForm
        courses={COURSES}
        players={[firstPlayer]}
        initialValues={{
          name: 'Torsdagsrunden',
          course_id: 'course-1',
          tee_box_id: '',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          game_mode: 'stableford',
          team_size: 1,
          players: [
            { user_id: 'u-first', team_number: null, flight_number: null },
          ],
        }}
        mode={{
          kind: 'edit-scheduled',
          gameId: 'game-1',
          updateAction: NO_OP_UPDATE,
        }}
      />,
    );

    const saveBtn = screen.getByRole('button', { name: /lagre endringer/i });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveAttribute('aria-describedby', 'publish-missing');
    expect(document.getElementById('publish-missing')).toBeInTheDocument();
    // #2210: the save learns who the form was opened with.
    expect(
      (
        container.querySelector(
          'input[name="roster_loaded_ids"]',
        ) as HTMLInputElement | null
      )?.value,
    ).toBe('u-first');

    // A save that bounces back (?error=…) re-renders the same form with the
    // server's newer roster while the form keeps the selection it mounted
    // with. The ids stay the ones the form was opened with, or the next save
    // would delete the late sign-up.
    const latePlayer = makePlayer('u-late', 'Sen Påmelding');
    rerender(
      <GameForm
        courses={COURSES}
        players={[firstPlayer, latePlayer]}
        initialValues={{
          name: 'Torsdagsrunden',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          game_mode: 'stableford',
          team_size: 1,
          players: [
            { user_id: 'u-first', team_number: null, flight_number: null },
            { user_id: 'u-late', team_number: null, flight_number: null },
          ],
        }}
        mode={{
          kind: 'edit-scheduled',
          gameId: 'game-1',
          updateAction: NO_OP_UPDATE,
        }}
      />,
    );
    expect(
      (
        container.querySelector(
          'input[name="roster_loaded_ids"]',
        ) as HTMLInputElement | null
      )?.value,
    ).toBe('u-first');
  });
});

describe('GameForm — #2209 tee-kategorien sendes for alle valgte spillere', () => {
  // Before #2437, Skins (like Wolf, Nassau, BBB, Nines, Round Robin and Acey
  // Deucey) rendered no M/D/J toggle, so the only field carrying the category —
  // the hidden input inside the toggle — was never mounted and the edit sent
  // none. Every selected player now gets exactly one field from an
  // always-mounted block.
  const NO_OP_UPDATE = async () => {};

  it('#2209: Skins i redigering sender lagret kategori for hver spiller', () => {
    const { container } = render(
      <GameForm
        courses={COURSES}
        players={EIGHT_PLAYERS.slice(0, 2)}
        initialValues={{
          name: 'Skins-runden',
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          scheduled_tee_off_at: FUTURE_TEE_OFF,
          game_mode: 'skins',
          team_size: 1,
          players: [
            { user_id: 'u0', team_number: null, flight_number: null },
            { user_id: 'u1', team_number: null, flight_number: null },
          ],
          player_genders: { u1: 'D' },
        }}
        mode={{
          kind: 'edit-scheduled',
          gameId: 'game-1',
          updateAction: NO_OP_UPDATE,
        }}
      />,
    );

    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('player_u1_gender')).toEqual(['D']);
    expect(fd.getAll('player_u0_gender')).toEqual(['M']);
  });
});

describe('GameForm — «Rediger spill» på en klubb-turnering (#2433)', () => {
  // Built the way both edit pages build it (buildEditFormInitialValues). A club
  // tournament saves with an empty roster, since the members sign up
  // themselves; an older club game on «Åpen» keeps its mode choice and saves
  // exactly as before.
  const NO_OP_UPDATE = async () => {};
  const TEE_OFF_ISO = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  function editRow(overrides: Partial<EditGameRow>): EditGameRow {
    return {
      id: 'game-1',
      name: 'Klubbmesterskap',
      courses: null,
      status: 'scheduled',
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      scheduled_tee_off_at: TEE_OFF_ISO,
      hcp_allowance_pct: 100,
      require_peer_approval: false,
      score_visibility: 'live',
      side_tournament_enabled: false,
      side_ld_count: 0,
      side_ctp_count: 0,
      side_disabled_categories: [],
      game_mode: 'stableford',
      mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
      registration_mode: 'invite_only',
      registration_type: 'solo',
      let_friends_skip_gate: false,
      group_id: 'club-1',
      tournament_id: null,
      ...overrides,
    };
  }

  function renderEdit(row: EditGameRow, players: PlayerOption[], playerRows: Parameters<typeof buildEditFormInitialValues>[1]) {
    return render(
      <GameForm
        courses={COURSES}
        players={players}
        initialValues={buildEditFormInitialValues(row, playerRows)}
        mode={{ kind: 'edit-scheduled', gameId: 'game-1', updateAction: NO_OP_UPDATE }}
      />,
    );
  }

  it('klubb, invite_only, individuelt, tom liste: «Lagre endringer» er aktiv, og modusvalget er skjult', () => {
    const { container } = renderEdit(editRow({}), [], []);

    expect(screen.getByTestId('save-changes')).toBeEnabled();
    expect(container.querySelector('input[name=registration_mode_input]')).toBeNull();
  });

  it('(vakt) eldre klubbspill med «Åpen» og «Lag» lagres som før: modusvalget står, og lagret modus sendes', () => {
    const row = editRow({
      game_mode: 'texas_scramble',
      mode_config: { kind: 'texas_scramble', team_size: 4, teams_count: 1, team_handicap_pct: 10 },
      registration_mode: 'open',
      registration_type: 'team',
    });
    const { container } = renderEdit(row, EIGHT_PLAYERS.slice(0, 2), [
      { user_id: 'u0', team_number: 1, flight_number: 1, tee_gender: 'mens' },
      { user_id: 'u1', team_number: 1, flight_number: 1, tee_gender: 'mens' },
    ]);

    expect(screen.getByTestId('save-changes')).toBeEnabled();
    expect(container.querySelector('input[name=registration_mode_input]')).not.toBeNull();
    expect(
      (container.querySelector('input[type=hidden][name=registration_mode]') as HTMLInputElement).value,
    ).toBe('open');
  });
});
