import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GameWizard } from './GameWizard';
import { BasicsSection } from './sections/BasicsSection';
import { useGameFormState } from './useGameFormState';
import type { CourseOption, PlayerOption } from './GameForm';
import type { CreateGameResult } from './actions';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import type { ClubOption } from '@/lib/games/newGameFormData';
import {
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftStorageKey,
  type WizardDraft,
} from './wizardStatePersistence';

// #1380: veiviseren speiler nå utfyllingen til sessionStorage. Nullstill
// mellom testene så et utkast fra én test ikke gjenopprettes i den neste.
beforeEach(() => {
  window.sessionStorage.clear();
});

// #928: tee-off 7 days out so the past-tee-off guard never rejects these
// fixtures. Computed relative to now so it can't go stale like a hard-coded date.
const FUTURE_TEE_OFF = (() => {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

// Tester GameWizard-orchestratoren etter F2-redesign (#272): 5-stegs
// navigasjons-flyt med intent-først, per-steg-validering, auto-name basert
// på bane/tee-off, og bekreftelse på at FormData som sendes til
// server-actions matcher dagens GameForm-payload.
//
// next/navigation er auto-stubbet globalt i vitest.setup.ts. Wizard-en
// faller derfor tilbake til default-step=1 uavhengig av URL —
// tilstrekkelig for behaviour-testene her.

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
// Navn + beskrivelse rendres fra modes.* / formatGuide.content.* (i18n Fase D,
// #592); vitest-stubben resolver dem mot no.json.
function formatRow(
  slug: string,
  is_primary: boolean,
  sort_order: number,
): FormatForIntent {
  return {
    slug,
    icon_key: slug,
    is_primary,
    sort_order,
  };
}

const FORMATS_BY_INTENT = {
  kompis: [
    formatRow('stableford', true, 10),
    formatRow('best_ball', true, 20),
    formatRow('texas_scramble', false, 30),
    formatRow('singles_matchplay', false, 40),
  ],
  klubb: [
    formatRow('stableford', true, 10),
    formatRow('best_ball', true, 20),
    formatRow('texas_scramble', true, 30),
    formatRow('solo_strokeplay', true, 40),
  ],
  solo: [
    formatRow('stableford', true, 10),
    formatRow('solo_strokeplay', true, 20),
  ],
};

// #1379: opprett-actionene returnerer nå et resultat i stedet for å redirecte
// ved feil. `{ error: '' }` er «alt gikk bra»-formen.
const NO_OP = async (): Promise<CreateGameResult> => ({ error: '' });

function renderWizard({
  courses = COURSES,
  players = EIGHT_PLAYERS,
  // #464: picker-kilden er venne-filtrert for kompis/cup. Default-test-spillerne
  // er arrangørens venner så de er valgbare i steg 4, slik de ville vært i bruk.
  friendPlayerIds = players.map((p) => p.id),
  createDraftAction = NO_OP,
  createAndPublishAction = NO_OP,
  initialValues,
  clubs,
  clubMemberIdsByClub,
  isAdmin,
}: {
  courses?: CourseOption[];
  players?: PlayerOption[];
  friendPlayerIds?: string[];
  createDraftAction?: (fd: FormData) => Promise<CreateGameResult>;
  createAndPublishAction?: (fd: FormData) => Promise<CreateGameResult>;
  initialValues?: Parameters<typeof GameWizard>[0]['initialValues'];
  clubs?: ClubOption[];
  clubMemberIdsByClub?: Record<string, string[]>;
  isAdmin?: boolean;
} = {}) {
  return render(
    <GameWizard
      courses={courses}
      players={players}
      mode={{
        kind: 'create',
        createDraftAction,
        createAndPublishAction,
      }}
      initialValues={initialValues}
      formatsByIntent={FORMATS_BY_INTENT}
      friendPlayerIds={friendPlayerIds}
      clubs={clubs}
      clubMemberIdsByClub={clubMemberIdsByClub}
      isAdmin={isAdmin}
      backHref="/"
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

// Helper: klikk Kompis-intent. #1794: flisen ER steg-overgangen — steg 1 har
// ikke annet innhold, så klikket sender arrangøren rett til steg 2. Ingen
// «Neste» her lenger.
function pickKompisIntent() {
  fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));
}

// #2260: med 4 spillere (standard) er stableford det anbefalte formatet i
// test-katalogen, så radioen er kortets «Velg stableford» — og «Valgt:
// Stableford» når den er valgt.
const STABLEFORD_CARD = /^(velg stableford|valgt: stableford)$/i;

// Helper: pluck stableford-format i step 2 (Kompis-katalog har stableford
// som primary).
function pickStablefordFormat() {
  fireEvent.click(screen.getByRole('radio', { name: STABLEFORD_CARD }));
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();

    // Steg 4 (Spillere). #1065: tomt roster er nå en gyldig fremover-
    // passering (registreringsvalget kommer på steg 5, ikke tatt ennå) — så
    // «Neste» er aktivert allerede før noen spillere er valgt.
    expectStep(4);
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
    clickNext();

    // Steg 5 (Klar): publiser-knappen skal være enabled.
    expectStep(5);
    // #1171: med roster ≥ 1 + bane valgt bærer knappen nå en verdi-oppsummering
    // («Publiser — 1 spiller · …»), så vi matcher på det stabile «publiser»-
    // fragmentet i stedet for den nøytrale full-labelen.
    const publishBtn = screen.getByRole('button', {
      name: /publiser/i,
    });
    expect(publishBtn).not.toBeDisabled();
  });

  // #1379: en serverfeil ved publisering skal IKKE kaste arrangøren ut av
  // veiviseren. Før fiksen redirectet actionen til `?error=…`, veiviseren ble
  // montert på nytt og bane/format/spillere var borte. Testen spør kun om det
  // ene: overlever valgene feilen, og ser arrangøren den?
  it('serverfeil ved publisering beholder steg 5 og valgene, og viser banner', async () => {
    const failingPublish = vi.fn(
      async (): Promise<CreateGameResult> => ({ error: 'db_game' }),
    );
    renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      createAndPublishAction: failingPublish,
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    // #1400: «Skjul til slutt» er controlled state + manuell dispatch, så
    // react-doms form-reset ved feilet publisering kan ikke hoppe den tilbake
    // til «Live» — verken i state eller i DOM.
    fireEvent.click(screen.getByText('Vis avanserte innstillinger'));
    const reveal = document.querySelector<HTMLInputElement>(
      'input[type="radio"][value="reveal"]',
    )!;
    fireEvent.click(reveal);
    expect(reveal.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /publiser/i }));

    expect(await screen.findByTestId('wizard-submit-error')).toBeInTheDocument();
    expect(failingPublish).toHaveBeenCalled();
    // Fortsatt på steg 5, med banen fra steg 3 i sjekklista.
    expectStep(5);
    expect(screen.getByTestId('ready-row-course')).toHaveTextContent('Stiklestad GK');
    expect(
      document.querySelector<HTMLInputElement>(
        'input[type="radio"][value="reveal"]',
      )!.checked,
    ).toBe(true);
    // Det skjulte feltet som faktisk sendes følger radioen.
    expect(
      document.querySelector<HTMLInputElement>('input[name="score_visibility"]')!
        .value,
    ).toBe('reveal');
  });

  it('på steg 1 er «Tilbake» en lenke ut av veiviseren (backHref)', () => {
    renderWizard();
    expect(screen.getByRole('link', { name: /^tilbake$/i })).toHaveAttribute('href', '/');
  });

  it('«Tilbake» fra steg 2 går tilbake til steg 1 og bevarer intent-valg', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    pickKompisIntent();
    expectStep(2);
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    expectStep(1);
    // Kompis-tile skal fortsatt være valgt.
    expect(
      screen.getByRole('button', { name: /kompis-runde/i }).getAttribute('aria-current'),
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
      target: { value: FUTURE_TEE_OFF },
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext(); // → steg 4

    // Velg alle 8 spillere.
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }

    // #2321: lag og flights står på steg 4s andre skjerm.
    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));

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
    formatRow('stableford', true, 10),
    formatRow('best_ball', true, 20),
    formatRow('nines', false, 71),
  ],
};

function renderWizardWithNines() {
  return render(
    <GameWizard
      courses={COURSES}
      players={EIGHT_PLAYERS}
      mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
      formatsByIntent={FORMATS_BY_INTENT_WITH_NINES}
      backHref="/"
    />,
  );
}

describe('GameWizard — #373 Kompis teller-filter', () => {
  it('count=3 skjuler best_ball og viser nines i steg 2', () => {
    renderWizardWithNines();

    // Steg 1: velg Kompis
    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));

    // Steg 2: default er 4 spillere → best_ball passer (partall 2–8),
    // nines (nøyaktig 3) er filtrert bort fra start
    expect(screen.getByRole('radio', { name: /^best ball$/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /^nines \/ split sixes$/i })).not.toBeInTheDocument();

    // Trykk «Én spiller til» to ganger: → 6 (default 4 + 2)
    // Trykk «Én spiller færre» tre ganger: → 3
    fireEvent.click(screen.getByRole('button', { name: /én spiller til/i }));
    fireEvent.click(screen.getByRole('button', { name: /én spiller til/i }));
    fireEvent.click(screen.getByRole('button', { name: /én spiller færre/i }));
    fireEvent.click(screen.getByRole('button', { name: /én spiller færre/i }));
    fireEvent.click(screen.getByRole('button', { name: /én spiller færre/i }));

    // count=3: best_ball passer ikke (trenger partall ≥2), nines passer (nøyaktig 3)
    expect(screen.queryByRole('radio', { name: /^best ball$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^nines \/ split sixes$/i })).toBeInTheDocument();
  });
});

// #1065: Påmelding (registrering + startkontingent + allowance) flyttet fra
// steg 2 til steg 5 (ReadyStep). «Hvem kan melde seg på?» står i klartekst på
// steg 5 (#367-mandatet); «Hva melder man på?» + kontingent bor inne i «Vis
// avanserte innstillinger»-disclosuren.
function goToReadyStep() {
  pickKompisIntent(); // steg 1 → 2
  pickBestBallFormat();
  clickNext(); // steg 2 → 3
  fireEvent.change(screen.getByLabelText(/^bane$/i), {
    target: { value: 'course-1' },
  });
  fireEvent.change(screen.getByLabelText(/^tee$/i), {
    target: { value: 'tee-1' },
  });
  fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
    target: { value: FUTURE_TEE_OFF },
  });
  clickNext(); // steg 3 → 4
  clickNext(); // steg 4 → 5 (tomt roster er nå en gyldig fremover-passering, #1065)
  expectStep(5);
}

function openAdvanced() {
  fireEvent.click(screen.getByText('Vis avanserte innstillinger'));
}

describe('GameWizard — steg 2 rendrer ikke lenger Påmelding/allowance (#1065)', () => {
  it('steg 2 har ingen Påmelding-radioer eller allowance-felt etter format er valgt', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();

    expect(
      screen.queryByRole('radio', { name: /bare de jeg inviterer/i }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: /^individuelt$/i })).toBeNull();
    expect(screen.queryByText(/startkontingent/i)).toBeNull();
  });

  it('steg 2 har ingen HCP-allowance-felt for stableford', () => {
    renderWizard();
    pickKompisIntent();
    pickStablefordFormat();

    expect(screen.queryByText(/hcp-andel/i)).toBeNull();
  });
});

describe('GameWizard — Påmelding-felter på steg 5 (#199, flyttet av #1065)', () => {
  it('rendrer «Hvem kan melde seg på?» synlig på steg 5 (utenfor disclosure) med default invite_only', () => {
    renderWizard();
    goToReadyStep();

    // Synlig UTEN å åpne «Vis avanserte innstillinger».
    expect(
      screen.getByRole('radio', { name: /bare de jeg inviterer/i }),
    ).toBeChecked();
  });

  it('«Hva melder man på?» (individuelt/lag) ligger inne i disclosuren', () => {
    renderWizard();
    goToReadyStep();

    expect(screen.queryByRole('radio', { name: /^individuelt$/i })).toBeNull();
    openAdvanced();
    expect(screen.getByRole('radio', { name: /^individuelt$/i })).toBeChecked();
  });

  it('disabler "lag" når modus er stableford (solo-modus)', () => {
    renderWizard();
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    clickNext();
    expectStep(5);
    openAdvanced();

    expect(screen.getByRole('radio', { name: /^lag$/i })).toBeDisabled();
    // #1792: «begge»-radioen er fjernet fra UI-et — kun individuelt/lag igjen.
    expect(screen.queryByRole('radio', { name: /^begge$/i })).toBeNull();
    expect(screen.getByRole('radio', { name: /^individuelt$/i })).toBeChecked();
  });

  it('lar "lag" velges når modus er best_ball', () => {
    renderWizard();
    goToReadyStep();
    openAdvanced();

    const teamRadio = screen.getByRole('radio', { name: /^lag$/i });
    expect(teamRadio).not.toBeDisabled();
    fireEvent.click(teamRadio);
    expect(teamRadio).toBeChecked();
  });

  it('inkluderer registration_mode + registration_type i FormData', () => {
    const { container } = renderWizard();
    goToReadyStep();

    let fd = new FormData(container.querySelector('form')!);
    expect(fd.get('registration_mode')).toBe('invite_only');
    expect(fd.get('registration_type')).toBe('solo');

    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));
    fd = new FormData(container.querySelector('form')!);
    expect(fd.get('registration_mode')).toBe('open');
  });
});

describe('GameWizard — #1065 steg-4-gate: registreringsvalg ikke tatt ennå', () => {
  it('steg 4 «Neste» er aktivert med tomt roster (registreringsvalget kommer på steg 5)', () => {
    renderWizard();
    pickKompisIntent();
    pickBestBallFormat();
    clickNext(); // → steg 3
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext(); // → steg 4
    expectStep(4);

    // Tomt roster: «Neste» er IKKE disabled (#1065 — gaten slipper på tomt
    // roster i stedet for et registreringsvalg som ikke er tatt ennå).
    expect(screen.getByRole('button', { name: /^neste$/i })).not.toBeDisabled();
    expect(
      screen.getByText(/du bestemmer på neste steg/i),
    ).toBeInTheDocument();
  });

  it('steg 4 «Neste» blokkeres av en PÅBEGYNT men ugyldig seleksjon (guardrail beholdt)', () => {
    renderWizard();
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    expectStep(4);

    // Best ball krever partall fordelt 2 per lag — velg ÉN spiller (ugyldig
    // for modusen). #2321: lag-skjermen har ikke innhold med én, så «Neste:
    // lagene» er av.
    fireEvent.click(
      screen.getByRole('checkbox', { name: /spiller 1/i }),
    );
    expect(screen.getByRole('button', { name: /^neste: lagene$/i })).toBeDisabled();

    // Med tre valgt åpner den lag-skjermen, og der blokkerer oddetallet «Neste».
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 2/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 3/i }));
    expect(screen.getByRole('button', { name: /^neste: lagene$/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));
    expect(screen.getByRole('heading', { name: /^lag$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();
  });

  it('publiserer med invite_only (default) og tomt roster: canPublish er false, med lenke tilbake til steg 4', () => {
    renderWizard();
    goToReadyStep();

    const publishBtn = screen.getByRole('button', {
      name: /publiser og del/i,
    });
    expect(publishBtn).toBeDisabled();
    // #2282: veien tilbake er Spillere-radens «Endre» i sjekklista.
    const playersRow = screen.getByTestId('ready-row-players');
    expect(playersRow).toHaveAttribute('data-status', 'block');
    expect(within(playersRow).getByRole('button')).toBeInTheDocument();
  });

  it('«Endre» på Spillere navigerer faktisk tilbake til steg 4', () => {
    renderWizard();
    goToReadyStep();

    fireEvent.click(within(screen.getByTestId('ready-row-players')).getByRole('button'));
    expectStep(4);
  });

  it('publish-håndhevingen er uendret: valg av åpen påmelding på steg 5 gjør canPublish true selv med tomt roster', () => {
    renderWizard();
    goToReadyStep();

    fireEvent.click(screen.getByRole('radio', { name: /åpen påmelding/i }));

    const publishBtn = screen.getByRole('button', {
      name: /publiser og del/i,
    });
    expect(publishBtn).not.toBeDisabled();
  });
});

describe('GameWizard — FormData-skjema speiler GameForm (K10)', () => {
  it('publiserer med samme FormData-keys som GameForm ville sendt', async () => {
    const publishSpy = vi.fn(async (): Promise<CreateGameResult> => ({ error: '' }));
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
      target: { value: FUTURE_TEE_OFF },
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
    expect(fd.get('scheduled_tee_off_at')).toBe(FUTURE_TEE_OFF);
    expect(fd.get('player_0_id')).toBe('u0');
    expect(fd.get('player_0_team')).toBe('');
    expect(fd.get('player_0_flight')).toBe('');
    // Auto-name derives "{course} {day}. {nb-month}" from the tee-off date;
    // compute it from FUTURE_TEE_OFF so it tracks the dynamic fixture.
    const teeDate = new Date(FUTURE_TEE_OFF);
    const nbMonths = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
    expect(fd.get('name')).toBe(`Stiklestad GK ${teeDate.getDate()}. ${nbMonths[teeDate.getMonth()]}`);
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    for (const player of EIGHT_PLAYERS) {
      fireEvent.click(
        screen.getByRole('checkbox', { name: new RegExp(player.name!, 'i') }),
      );
    }
    // #2321: «Trekk tilfeldig» står på lag-skjermen.
    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));
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

  // #2209: on a course with two tees the organiser must pick one in the
  // dropdown, and that pick used to wipe the profile defaults — every lady and
  // junior was sent as 'M'. Read on step 5, where TeamsAssignmentSection is
  // unmounted, so exactly one field per player reaches the server.
  it('#2209: tee-valget i nedtrekkslista beholder dame og junior fra profilen', () => {
    const twoTeeCourses: CourseOption[] = [
      {
        id: 'course-1',
        name: 'Stiklestad GK',
        tee_boxes: [
          { id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: true },
          { id: 'tee-2', name: 'Hvit', has_mens: true, has_ladies: false, has_juniors: false },
        ],
      },
    ];
    const lady: PlayerOption = { ...makePlayer('p-dame', 'Dame Spiller'), gender: 'ladies' };
    const junior: PlayerOption = { ...makePlayer('p-junior', 'Junior Spiller'), level: 'junior' };
    const { container } = renderWizard({
      courses: twoTeeCourses,
      players: [lady, junior],
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /dame spiller/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /junior spiller/i }));
    clickNext();
    expectStep(5);

    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('player_p-dame_gender')).toEqual(['D']);
    expect(fd.getAll('player_p-junior_gender')).toEqual(['J']);
  });
});

describe('GameWizard — «Shotgun-start» overlever til steg 5 (#2258)', () => {
  it.each([
    [true, 'shotgun'],
    [false, 'first_tee'],
  ] as const)('ticked on step 3: %s → FormData start_type %s on step 5', (tick, expected) => {
    const { container } = renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      initialValues: { game_mode: 'stableford', course_id: 'course-1', tee_box_id: 'tee-1' },
    });

    pickKompisIntent();
    pickStablefordFormat();
    clickNext();
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    if (tick) fireEvent.click(screen.getByRole('checkbox', { name: 'Shotgun-start' }));
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    // Step 3 (and its checkbox) is unmounted here; only the mirror is left.
    expect(screen.queryByRole('checkbox', { name: 'Shotgun-start' })).toBeNull();
    const fd = new FormData(container.querySelector('form')!);
    expect(fd.getAll('start_type')).toEqual([expected]);
  });
});

describe('GameWizard — #1011 sideturnering overlever lukket disclosure', () => {
  it('FormData har side_tournament_enabled + riktige counts uten å åpne «Vis avanserte innstillinger»', () => {
    const { container } = renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      initialValues: {
        game_mode: 'stableford',
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        side_tournament_enabled: true,
        side_ld_count: 2,
        side_ctp_count: 1,
      },
    });

    pickKompisIntent();
    pickStablefordFormat();
    clickNext();
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    // Disclosure ("Vis avanserte innstillinger") aldri åpnet på steg 5 —
    // AdvancedSettingsSection (og dermed LD/CTP-radioene) er derfor ikke
    // montert i det hele tatt.
    expect(
      screen.queryByText('Vis avanserte innstillinger'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /sideturnering/i })).toBeNull();

    const form = container.querySelector('form');
    const fd = new FormData(form!);

    expect(fd.get('side_tournament_enabled')).toBe('true');
    expect(fd.get('side_ld_count')).toBe('2');
    expect(fd.get('side_ctp_count')).toBe('1');
  });

  it('åpen disclosure gir IKKE duplikat-entries (LD/CTP-feltene emitter ikke name i controlled mode)', () => {
    const { container } = renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      initialValues: {
        game_mode: 'stableford',
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        side_tournament_enabled: true,
        side_ld_count: 2,
        side_ctp_count: 1,
      },
    });

    pickKompisIntent();
    pickStablefordFormat();
    clickNext();
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    // Åpne disclosure-en så AdvancedSettingsSection faktisk er montert
    // samtidig med FormDataInputs-speilingen.
    fireEvent.click(screen.getByText('Vis avanserte innstillinger'));
    expect(
      screen.getByRole('switch', { name: /sideturnering/i }),
    ).toBeChecked();

    const form = container.querySelector('form');
    const fd = new FormData(form!);

    // Nøyaktig ÉN kilde per felt — hidden-speilingen i FormDataInputs.
    expect(fd.getAll('side_tournament_enabled')).toEqual(['true']);
    expect(fd.getAll('side_ld_count')).toEqual(['2']);
    expect(fd.getAll('side_ctp_count')).toEqual(['1']);
  });
});

describe('GameWizard — #1065 allowance + kontingent overlever flytting til steg 5', () => {
  it('hcp_allowance_pct + entry_fee_kr + payment_link speiles i FormData uansett disclosure-tilstand, uten duplikater', () => {
    const { container } = renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    pickKompisIntent();
    pickStablefordFormat(); // → hcp_allowance_pct-feltet vises (stableford-familien)
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    // Disclosure lukket: default-verdier (100 % allowance, ingen kontingent)
    // skal likevel være i FormData — samme garanti #1011 ga sideturnering.
    let form = container.querySelector('form');
    let fd = new FormData(form!);
    expect(fd.get('hcp_allowance_pct')).toBe('100');
    expect(fd.get('entry_fee_kr')).toBe('');
    expect(fd.get('payment_link')).toBe('');

    // Åpne disclosuren og sett en kontingent — feltene er nå faktisk montert
    // (AllowanceField + RegistrationSection sin betalings-fieldset).
    openAdvanced();
    fireEvent.change(screen.getByLabelText(/beløp per spiller/i), {
      target: { value: '150' },
    });
    fireEvent.change(screen.getByLabelText(/vipps-nummer/i), {
      target: { value: '12345' },
    });

    form = container.querySelector('form');
    fd = new FormData(form!);
    // Nøyaktig ÉN verdi per felt — AllowanceField sin hideHiddenInput og
    // RegistrationSection sine controlled inputs unngår duplikat-entries;
    // FormDataInputs er eneste kilde.
    expect(fd.getAll('hcp_allowance_pct')).toEqual(['100']);
    expect(fd.getAll('entry_fee_kr')).toEqual(['150']);
    expect(fd.getAll('payment_link')).toEqual(['12345']);
  });
});

describe('GameWizard — Cup-intent flow', () => {
  it('rendrer CupSetup (cup-navn + lag-navn) på steg 2 med intent=cup', () => {
    renderWizard();
    // #1794: også cup-grenens steg 1 går videre på flis-klikket.
    fireEvent.click(screen.getByRole('button', { name: /^cup$/i }));

    // Wizard-en er nå i cup-creation-flyt: bare 2 steg vises, og CupSetup
    // sin form er på skjermen.
    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lag 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lag 2/i)).toBeInTheDocument();
    // #1472: format-multiselecten er fjernet fra opprettelsen (format velges i
    // Oppsett-rommet etterpå) — ingen `cup_format_*`-checkboxer her lenger.
    expect(
      document.querySelector('input[id^="cup_format_"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opprett cup/i })).toBeInTheDocument();
  });
});

// #1380: utfyllingen skal overleve reload / PWA-eviction. Selve browser-back-
// oppførselen krever ekte history (staging-klikket er porten der); det som er
// unit-testbart er gjenopprettingen fra sessionStorage og opprydningen når
// spillet publiseres eller lagres som utkast.
describe('GameWizard — #1380 utkast overlever reload', () => {
  // usePathname er stubbet til '/' i vitest.setup.ts.
  const DRAFT_KEY = wizardDraftStorageKey('/');
  const DRAFT_CONTEXT = wizardDraftContext({});

  function seedDraft(overrides: Partial<WizardDraft['values']> = {}) {
    const draft: WizardDraft = {
      intent: 'kompis',
      expectedPlayerCount: 4,
      nameTouched: true,
      values: {
        name: 'Lørdagsrunden',
        game_mode: 'stableford',
        team_size: 1,
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        scheduled_tee_off_at: FUTURE_TEE_OFF,
        players: [{ user_id: 'u0', team_number: null, flight_number: null }],
        ...overrides,
      },
    };
    saveWizardDraft(DRAFT_KEY, draft, DRAFT_CONTEXT);
  }

  it('gjenoppretter arrangement, format, bane og spillere fra sessionStorage', () => {
    seedDraft();
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    // Steg 1: arrangement-valget er tilbake.
    expectStep(1);
    expect(
      screen.getByRole('button', { name: /kompis-runde/i }).getAttribute('aria-current'),
    ).toBe('true');

    // Steg 2: formatet er tilbake (og «Neste» er dermed åpen).
    clickNext();
    expectStep(2);
    expect(
      screen.getByRole('radio', { name: STABLEFORD_CARD }).getAttribute('aria-checked'),
    ).toBe('true');

    // Steg 3: bane, tee og tee-off er tilbake.
    clickNext();
    expectStep(3);
    expect(screen.getByLabelText(/^bane$/i)).toHaveValue('course-1');
    expect(screen.getByLabelText(/^tee$/i)).toHaveValue('tee-1');
    expect(screen.getByLabelText(/^tee-off$/i)).toHaveValue(FUTURE_TEE_OFF);

    // Steg 4: spilleren arrangøren hadde krysset av er fortsatt valgt — den
    // ligger i payloaden (og er derfor ute av den valgbare lista, som viser
    // ikke-valgte).
    clickNext();
    expectStep(4);
    expect(document.querySelector('input[name="player_0_id"]')).toHaveValue('u0');
    // #2321: a selected card stays in the grid, checked.
    expect(screen.getByRole('checkbox', { name: /spiller 1/i })).toBeChecked();
  });

  it('starter blankt når utkastet ble skrevet i en annen mount-kontekst', () => {
    seedDraft();
    // Cup-lenke: samme sti, men formatet er låst av ruta. Et utkast fra et
    // vanlig besøk skal ikke kunne overstyre det.
    renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      initialValues: {
        tournament_id: 'cup-1',
        game_mode: 'fourball_matchplay',
        lock_game_mode: true,
      },
    });

    expectStep(1);
    expect(
      screen.getByRole('button', { name: /kompis-runde/i }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('skriver utkastet når arrangøren fyller ut noe', async () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    pickKompisIntent();
    pickStablefordFormat();

    await waitFor(() =>
      expect(window.sessionStorage.getItem(DRAFT_KEY)).not.toBeNull(),
    );
  });

  it('sletter utkastet når spillet lagres som utkast', async () => {
    seedDraft();
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });

    clickNext(); // → steg 2
    clickNext(); // → steg 3
    clickNext(); // → steg 4
    clickNext(); // → steg 5
    expectStep(5);

    fireEvent.click(screen.getByRole('button', { name: /lagre som utkast/i }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull(),
    );
  });
});

// #1999: eieren opprettet fire runder som alle endte med forslags-navnet
// «Byneset North 6. september». Regelen «navnet er skrevet av et menneske»
// hadde to hjem — verdien i hooken, flagget i GameWizard — og bare ETT
// kallsted meldte fra. Testene under holder regelen på plass fra begge
// retninger: et skrevet navn overlever bane- og tee-off-bytte (B1/B2/B8),
// forslaget følger fortsatt bane og tee-off når ingen har rørt navnet (B3),
// og navnefeltet i BasicsSection markerer navnet som rørt selv om ingen
// husket å koble opp et flagg (B4).
describe('GameWizard — #1999 et skrevet spillnavn overlever', () => {
  const OTHER_COURSE: CourseOption = {
    id: 'course-2',
    name: 'Byneset GK',
    tee_boxes: [
      {
        id: 'tee-2',
        name: 'Hvit',
        has_mens: true,
        has_ladies: true,
        has_juniors: false,
      },
    ],
  };

  const LATER_TEE_OFF = (() => {
    const d = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  function clickPrev() {
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
  }

  /** Steg 1 → 5 med bane, tee og tee-off fylt ut på steg 3. */
  function walkToReadyStep(courseId = 'course-1', teeId = 'tee-1') {
    pickKompisIntent();
    pickStablefordFormat();
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: courseId },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: teeId },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    clickNext();
    expectStep(5);
  }

  /** Navnefeltet på steg 5. Labelen er sr-only, id-en er `name`. */
  function nameField() {
    return screen.getByLabelText(/^navn på runden$/i);
  }

  it('B1: navnet står når tee-off endres etterpå', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    fireEvent.change(nameField(), { target: { value: 'Torsdagsgolf' } });
    expect(nameField()).toHaveValue('Torsdagsgolf');

    clickPrev(); // → steg 4
    clickPrev(); // → steg 3
    expectStep(3);
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: LATER_TEE_OFF },
    });

    clickNext();
    clickNext();
    expectStep(5);
    expect(nameField()).toHaveValue('Torsdagsgolf');
  });

  it('B2: navnet står når banen byttes etterpå', () => {
    renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      courses: [...COURSES, OTHER_COURSE],
    });
    walkToReadyStep();

    fireEvent.change(nameField(), { target: { value: 'Torsdagsgolf' } });

    clickPrev();
    clickPrev();
    expectStep(3);
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-2' },
    });

    clickNext();
    clickNext();
    expectStep(5);
    expect(nameField()).toHaveValue('Torsdagsgolf');
  });

  it('B3 (negativ kontroll): forslaget følger bane og tee-off når navnet er urørt', () => {
    renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      courses: [...COURSES, OTHER_COURSE],
    });
    walkToReadyStep();

    // Ingen har rørt navnet: forslaget er bane + dato.
    const nbMonths = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
    const suggestionFor = (course: string, iso: string) => {
      const d = new Date(iso);
      return `${course} ${d.getDate()}. ${nbMonths[d.getMonth()]}`;
    };
    expect(nameField()).toHaveValue(
      suggestionFor('Stiklestad GK', FUTURE_TEE_OFF),
    );

    // Bytt bane → forslaget skal følge etter (fiksen må ikke fryse det).
    clickPrev();
    clickPrev();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-2' },
    });
    clickNext();
    clickNext();
    expect(nameField()).toHaveValue(
      suggestionFor('Byneset GK', FUTURE_TEE_OFF),
    );

    // Bytt tee-off → forslaget skal fortsatt følge etter.
    clickPrev();
    clickPrev();
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: LATER_TEE_OFF },
    });
    clickNext();
    clickNext();
    expect(nameField()).toHaveValue(
      suggestionFor('Byneset GK', LATER_TEE_OFF),
    );
  });

  it('B8: navnet står i et synlig felt på steg 5 uten at noe er trykket på', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    // Ingen knapp å trykke på først: feltet ER der, med forslaget i seg.
    const field = nameField();
    // #2282: a one-row textarea (a long name wraps instead of being clipped),
    // still a plain editable field, never text that turns into one on a tap.
    expect(screen.getByRole('textbox', { name: /^navn på runden$/i })).toBe(field);
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveValue(`Stiklestad GK ${new Date(FUTURE_TEE_OFF).getDate()}. ${['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'][new Date(FUTURE_TEE_OFF).getMonth()]}`);

    fireEvent.change(field, { target: { value: 'Klubbkvelden' } });
    clickPrev();
    clickPrev();
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: LATER_TEE_OFF },
    });
    clickNext();
    clickNext();
    expect(nameField()).toHaveValue('Klubbkvelden');
  });
});

// #1999 del B: skrivingen til sessionStorage er debouncet 400 ms og ble aldri
// flushet. En reload eller en PWA-dvale innenfor det vinduet gjenopprettet
// utkastet fra FØR siste tastetrykk — og for spillnavnet forsvant både navnet
// og `nameTouched`-flagget som skulle beskyttet det, så auto-navnet overtok
// igjen. Dette er den eneste mekanismen i koden som faktisk gir symptomet
// eieren så 6. september.
describe('GameWizard — #1999 utkastet flushes før siden kan forsvinne', () => {
  const DRAFT_KEY = wizardDraftStorageKey('/');

  function readDraft(): WizardDraft | null {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw).draft as WizardDraft;
  }

  /** Steg 1 → 5 med bane, tee og tee-off fylt ut. */
  function walkToReadyStep() {
    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));
    fireEvent.click(screen.getByRole('radio', { name: STABLEFORD_CARD }));
    clickNext();
    fireEvent.change(screen.getByLabelText(/^bane$/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee$/i), {
      target: { value: 'tee-1' },
    });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), {
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    clickNext();
    expectStep(5);
  }

  it('B5: navnet overlever en remount rett etter tastetrykket', () => {
    const first = renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    // Skriv navnet og last siden på nytt UMIDDELBART — uten å la de 400 ms
    // gå. `pagehide` er det siden faktisk fyrer på vei ut.
    fireEvent.change(screen.getByLabelText(/^navn på runden$/i), {
      target: { value: 'Torsdagsgolf' },
    });
    fireEvent(window, new Event('pagehide'));
    first.unmount();

    const draft = readDraft();
    expect(draft?.values.name).toBe('Torsdagsgolf');
    expect(draft?.nameTouched).toBe(true);

    // Gjenopptaket bærer navnet, og auto-navnet overtar ikke.
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    clickNext();
    clickNext();
    clickNext();
    clickNext();
    expectStep(5);
    expect(screen.getByLabelText(/^navn på runden$/i)).toHaveValue('Torsdagsgolf');
  });

  it('B6: pagehide innenfor debounce-vinduet skriver gjeldende navn', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    fireEvent.change(screen.getByLabelText(/^navn på runden$/i), {
      target: { value: 'Klubbkvelden' },
    });
    fireEvent(window, new Event('pagehide'));

    expect(readDraft()?.values.name).toBe('Klubbkvelden');
  });

  it('B6b: visibilitychange til hidden flusher på samme måte', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    fireEvent.change(screen.getByLabelText(/^navn på runden$/i), {
      target: { value: 'Onsdagsrunden' },
    });
    const spy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    spy.mockRestore();

    expect(readDraft()?.values.name).toBe('Onsdagsrunden');
  });

  it('B7: pagehide etter en innsending skriver IKKE utkastet tilbake', async () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    fireEvent.change(screen.getByLabelText(/^navn på runden$/i), {
      target: { value: 'Torsdagsgolf' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lagre som utkast/i }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull(),
    );

    // Redirecten etter en publisering ER en pagehide. Den må ikke kunne
    // gjenopplive utkastet vi nettopp ryddet bort.
    fireEvent(window, new Event('pagehide'));
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('B7b: et stegbytte flusher, så ingenting ligger igjen i debounce-vinduet', () => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    walkToReadyStep();

    fireEvent.change(screen.getByLabelText(/^navn på runden$/i), {
      target: { value: 'Lørdagsrunden' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));

    expect(readDraft()?.values.name).toBe('Lørdagsrunden');
  });
});

// #1999 B4: navnefeltet i BasicsSection er skjult i veiviseren i dag
// (`showName={false}`), men GameForm rendrer det, og det er ÉN prop-verdi som
// står mellom oss og at feil-forklaringen i issue-teksten blir helt ekte.
// Feltet kaller bare `setName` og vet ingenting om noe flagg. Denne testen
// låser at det holder: `setName` markerer navnet som rørt av seg selv.
describe('BasicsSection — #1999 navnefeltet markerer navnet som rørt', () => {
  function Harness({ onState }: { onState: (touched: boolean) => void }) {
    const state = useGameFormState({
      players: EIGHT_PLAYERS.slice(0, 2),
      courses: COURSES,
    });
    onState(state.nameTouched);
    return <BasicsSection state={state} courses={COURSES} showName />;
  }

  it('B4: å skrive i navnefeltet setter nameTouched', () => {
    let touched = false;
    render(<Harness onState={(t) => { touched = t; }} />);

    expect(touched).toBe(false);

    fireEvent.change(screen.getByLabelText(/^spillnavn$/i), {
      target: { value: 'Fredagsrunden' },
    });

    expect(touched).toBe(true);
  });
});

// #2282: steg 5 er «Klar?» med invitasjonskortet og sjekklista.
describe('GameWizard — #2282 «Klar?»-steget', () => {
  // jsdom sender ikke skjemaet ved Enter, så en sjekk på at publiser ikke
  // kalles ville vært grønn også uten vakten. Spørsmålet er om tastetrykket
  // avbrytes (fireEvent gir `false` når preventDefault ble kalt).
  it.each([
    ['navnefeltet', () => screen.getByLabelText(/^navn på runden$/i)],
    ['beløpsfeltet', () => {
      openAdvanced();
      return screen.getByLabelText(/beløp per spiller/i);
    }],
  ])('Enter i %s avbrytes, så det publiserer ikke', (_label, field) => {
    renderWizard({ players: EIGHT_PLAYERS.slice(0, 2) });
    goToReadyStep();
    expect(fireEvent.keyDown(field(), { key: 'Enter' })).toBe(false);
  });

  it('Enter på en knapp i sjekklista avbrytes ikke', () => {
    renderWizard();
    goToReadyStep();
    const button = within(screen.getByTestId('ready-row-players')).getByRole('button');
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
  });

  it('ugyldig handicapandel gir rød Format-rad, og «Endre» åpner avanserte innstillinger med fokus i feltet', async () => {
    renderWizard({
      players: EIGHT_PLAYERS.slice(0, 2),
      initialValues: { game_mode: 'stableford', hcp_allowance_pct: '150' },
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
      target: { value: FUTURE_TEE_OFF },
    });
    clickNext();
    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    clickNext();
    expectStep(5);

    const formatRow = screen.getByTestId('ready-row-format');
    expect(formatRow).toHaveAttribute('data-status', 'block');
    expect(screen.queryByLabelText('Handicap-andel (%)')).toBeNull();

    fireEvent.click(within(formatRow).getByRole('button'));

    const field = await screen.findByLabelText('Handicap-andel (%)');
    expect(field).toHaveAttribute('id', 'hcp_allowance_pct__input');
    await waitFor(() => expect(field).toHaveFocus());
  });
});

describe('GameWizard — klubb-turnering velger klubben først (#2439)', () => {
  const BYNESET: ClubOption = { id: 'club-1', name: 'Byneset Golfklubb', role: 'member' };
  const TRONDHEIM: ClubOption = { id: 'club-2', name: 'Trondheim GK', role: 'owner' };
  const MEMBERS = {
    'club-1': ['u0', 'u1', 'u2'],
    'club-2': ['u0', 'u3'],
  };

  // The klubb list has no player count, so Stableford is a plain row (named
  // «Stableford»), not the big recommended card the kompis tests click.
  const STABLEFORD_ROW = /^stableford$/i;

  function pickKlubbIntent() {
    fireEvent.click(screen.getByRole('button', { name: /klubb-turnering/i }));
  }

  function hiddenGroupId(): string | null {
    return (document.querySelector('input[type="hidden"][name="group_id"]') as HTMLInputElement | null)
      ?.value ?? null;
  }

  it('én klubb: kortet står valgt fra start, over formatlista, og «Neste» slipper gjennom', () => {
    renderWizard({ isAdmin: true, clubs: [BYNESET], clubMemberIdsByClub: MEMBERS });

    pickKlubbIntent();
    expectStep(2);

    const clubGroup = screen.getByRole('group', { name: /hvilken klubb\?/i });
    const card = within(clubGroup).getByRole('radio', { name: /byneset golfklubb/i });
    expect(card).toBeChecked();
    expect(within(clubGroup).getByText('3 medlemmer')).toBeInTheDocument();
    expect(screen.queryByText(/ingen klubb/i)).not.toBeInTheDocument();
    expect(hiddenGroupId()).toBe('club-1');

    // Klubbdelen står over formatlista.
    const formatCard = screen.getByRole('radio', { name: STABLEFORD_ROW });
    expect(
      clubGroup.compareDocumentPosition(formatCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: STABLEFORD_ROW }));
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeEnabled();
    clickNext();
    expectStep(3);
  });

  it('to klubber: ingen er valgt, og «Neste» venter på et klubbkort', () => {
    renderWizard({
      isAdmin: true,
      clubs: [BYNESET, TRONDHEIM],
      clubMemberIdsByClub: MEMBERS,
    });

    pickKlubbIntent();
    const clubGroup = screen.getByRole('group', { name: /hvilken klubb\?/i });
    const radios = within(clubGroup).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios.forEach((r) => expect(r).not.toBeChecked());
    // Rollen din står foran antallet der du styrer klubben.
    expect(within(clubGroup).getByText('Eier · 2 medlemmer')).toBeInTheDocument();
    expect(hiddenGroupId()).toBe('');

    fireEvent.click(screen.getByRole('radio', { name: STABLEFORD_ROW }));
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeDisabled();
    expect(screen.getByText('Velg klubben først')).toBeInTheDocument();

    fireEvent.click(within(clubGroup).getByRole('radio', { name: /trondheim gk/i }));
    expect(hiddenGroupId()).toBe('club-2');
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeEnabled();
    expect(screen.queryByText('Velg klubben først')).not.toBeInTheDocument();
  });

  it('uten gyldig klubb vises ikke «Klubb-turnering» på steg 1, heller ikke for admin', () => {
    renderWizard({ isAdmin: true, clubs: [] });

    expectStep(1);
    expect(
      screen.queryByRole('button', { name: /klubb-turnering/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kompis-runde/i })).toBeInTheDocument();
  });

  it('kompis-runden har ingen klubbdel på steg 2', () => {
    renderWizard({ isAdmin: true, clubs: [BYNESET], clubMemberIdsByClub: MEMBERS });

    pickKompisIntent();
    expectStep(2);
    expect(screen.queryByRole('group', { name: /hvilken klubb\?/i })).not.toBeInTheDocument();
    expect(hiddenGroupId()).toBe('');
  });
});

describe('GameWizard — klubb-turnering uten spillere (#2433)', () => {
  const BYNESET: ClubOption = { id: 'club-1', name: 'Byneset Golfklubb', role: 'member' };
  const MEMBERS = { 'club-1': ['u0', 'u1', 'u2'] };
  const CLUB_HINT = /du kan også la lista stå tom\. medlemmene i klubben kan melde seg på selv\./i;
  const OLD_HINT = /du bestemmer på neste steg/i;

  /** Klubb-turnering in the one club, `format` picked, course/tee/tee-off set, on step 4. */
  function goToClubStep4(format: RegExp) {
    renderWizard({ isAdmin: true, clubs: [BYNESET], clubMemberIdsByClub: MEMBERS });
    fireEvent.click(screen.getByRole('button', { name: /klubb-turnering/i }));
    fireEvent.click(screen.getByRole('radio', { name: format }));
    clickNext(); // → steg 3
    fireEvent.change(screen.getByLabelText(/^bane$/i), { target: { value: 'course-1' } });
    fireEvent.change(screen.getByLabelText(/^tee$/i), { target: { value: 'tee-1' } });
    fireEvent.change(screen.getByLabelText(/^tee-off$/i), { target: { value: FUTURE_TEE_OFF } });
    clickNext(); // → steg 4
    expectStep(4);
  }

  it('tom liste: klubb-hintet står, og «Neste» er aktiv', () => {
    goToClubStep4(/^stableford$/i);

    expect(screen.getByText(CLUB_HINT)).toBeInTheDocument();
    expect(screen.queryByText(OLD_HINT)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeEnabled();
  });

  it('Texas med én spiller: «Neste» på lag-skjermen er aktiv', () => {
    goToClubStep4(/^texas scramble$/i);

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeEnabled();
  });

  it('best ball med én spiller: foten sier «Neste», og den er aktiv', () => {
    goToClubStep4(/^best ball$/i);

    fireEvent.click(screen.getByRole('checkbox', { name: /spiller 1/i }));
    expect(screen.queryByRole('button', { name: /^neste: lagene$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^neste$/i })).toBeEnabled();
  });

  it('påmeldingstype «Lag» og tom liste: ingen hint over velgeren', () => {
    goToClubStep4(/^texas scramble$/i);
    clickNext(); // → steg 5
    expectStep(5);
    openAdvanced();
    fireEvent.click(screen.getByRole('radio', { name: /^lag$/i }));
    fireEvent.click(within(screen.getByTestId('ready-row-players')).getByRole('button'));
    expectStep(4);

    expect(screen.queryByText(CLUB_HINT)).not.toBeInTheDocument();
    expect(screen.queryByText(OLD_HINT)).not.toBeInTheDocument();
  });
});
