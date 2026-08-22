import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { CourseOption, PlayerOption } from './GameForm';
import type { CreateGameResult } from './actions';
import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';

// #1380: steg-navigasjonen skriver URL-en på to helt ulike måter, og det er
// nettopp skillet som må testes:
//
//   push    — arrangøren gikk til et nytt steg. Hvert steg får sin egen
//             history-entry, så browser-back lander på forrige steg.
//   replace — vi normaliserte en URL ingen ba om (`?step=99` → steg 1).
//             Hadde normaliseringen pushet, ville back gått tilbake til den
//             ugyldige URL-en, som normaliserte på nytt, som pushet igjen …
//             en felle arrangøren ikke kommer ut av.
//
// Det delte oppsettet (vitest.setup.ts) stubber `useSearchParams` til alltid
// tom og gir en fersk `push`-spion per kall, så push/replace kan ikke drives
// derfra. Denne fila har derfor sine egne navigasjons-mocker — bevisst i en
// egen fil, så GameWizard.test.tsx beholder det delte oppsettet.
//
// #1383: mockene skriver også URL-en TILBAKE til `searchString`, slik den ekte
// router-en gjør. Uten det ser en test aldri en endret `searchParams`, og en
// effekt som feilaktig kjører på nytt ved navigasjon (i stedet for kun ved
// mount) er usynlig for suiten. Kombinert med `rerender()` er det nettopp den
// kjørestien som testes nederst i fila.

const push = vi.fn((url: string) => {
  searchString = url.split('?')[1] ?? '';
});
const replace = vi.fn((url: string) => {
  searchString = url.split('?')[1] ?? '';
});
let searchString = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/games/new',
  useSearchParams: () => new URLSearchParams(searchString),
  useParams: () => ({}),
}));

vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
    useRouter: () => ({ push, replace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
    usePathname: () => '/admin/games/new',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Link: ({ href, children, ...rest }: { href: string; children: any; [k: string]: unknown }) =>
      createElement('a', { href, ...rest }, children),
    redirect: vi.fn(),
    getPathname: vi.fn(() => '/admin/games/new'),
  };
});

const { GameWizard } = await import('./GameWizard');

const COURSES: CourseOption[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    tee_boxes: [
      { id: 'tee-1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: false },
    ],
  },
];

const PLAYERS: PlayerOption[] = [
  {
    id: 'u0',
    name: 'Spiller 1',
    nickname: null,
    hcp_index: 18,
    email: 'u0@example.com',
    pending: false,
    gender: null,
    level: 'normal',
  },
];

function formatRow(slug: string, sort_order: number): FormatForIntent {
  return { slug, icon_key: slug, is_primary: true, sort_order };
}

const FORMATS_BY_INTENT = {
  kompis: [formatRow('stableford', 10), formatRow('best_ball', 20)],
  klubb: [formatRow('stableford', 10)],
  solo: [formatRow('stableford', 10)],
};

const NO_OP = async (): Promise<CreateGameResult> => ({ error: '' });

type WizardProps = ComponentProps<typeof GameWizard>;

function wizardElement(overrides: Partial<WizardProps> = {}) {
  return (
    <GameWizard
      courses={COURSES}
      players={PLAYERS}
      mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
      formatsByIntent={FORMATS_BY_INTENT}
      friendPlayerIds={PLAYERS.map((p) => p.id)}
      {...overrides}
    />
  );
}

function renderWizard(overrides: Partial<WizardProps> = {}) {
  return render(wizardElement(overrides));
}

/**
 * #1383: ruta har seedet flyten med forvalg (her `?bane=`-formen, som seeder
 * course_id). Et rent course_id-seed hever skallets reset-tak til steg 2
 * (#1653), så en test som skal lande direkte på `?step=2` må rendres med dette
 * — ellers sender reset-en flyten tilbake til steg 1 før testen rekker å gjøre
 * noe. Steg 3+ resettes fortsatt med samme seed (formatvalget er ikke dekket) —
 * se #1653-blokka nederst i fila.
 */
const SEEDED_BY_ROUTE: Partial<WizardProps> = {
  initialValues: { course_id: 'course-1' },
};

/**
 * #1653: cup-lenkas form (`/admin/games/new?tournament_id=…`) seeder mange felt
 * — format, låsen på det, og cup-koblingen. Den klassen skal aldri resettes:
 * arrangøren er bevisst sendt inn med forvalgene.
 */
const SEEDED_BY_CUP: Partial<WizardProps> = {
  initialValues: {
    tournament_id: 't1',
    game_mode: 'stableford',
    lock_game_mode: true,
  },
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  searchString = '';
  window.sessionStorage.clear();
});

describe('GameWizard — #1380 per-steg history', () => {
  it('steg-overgang arrangøren utløser pusher en history-entry', () => {
    renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /kompis-runde/i }));
    fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));

    expect(push).toHaveBeenCalledWith('/admin/games/new?step=2', { scroll: false });
    expect(replace).not.toHaveBeenCalled();
  });

  it('«Forrige» pusher også — hvert steg er sin egen history-entry', () => {
    searchString = 'step=2';
    renderWizard(SEEDED_BY_ROUTE);

    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));

    expect(push).toHaveBeenCalledWith('/admin/games/new', { scroll: false });
    expect(replace).not.toHaveBeenCalled();
  });

  it('normaliserer ugyldig ?step=99 med replace — ingen back-felle', () => {
    searchString = 'step=99';
    renderWizard();

    expect(replace).toHaveBeenCalledWith('/admin/games/new', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('lar andre søke-parametre stå når steget skrives til URL-en', () => {
    searchString = 'klubb=k1';
    renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /kompis-runde/i }));
    fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));

    expect(push).toHaveBeenCalledWith('/admin/games/new?klubb=k1&step=2', {
      scroll: false,
    });
  });

  it('skriver ikke URL-en når den allerede speiler steget', () => {
    searchString = 'step=2';
    renderWizard(SEEDED_BY_ROUTE);

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('GameWizard — #1383 foreldet ?step-lenke', () => {
  it('rører ikke steget når arrangøren selv går videre fra steg 1', () => {
    // Regresjonslås. «Er denne ?step-lenken foreldet?» er et mount-spørsmål.
    // Ble den avgjort på nytt ved hver navigasjon, ville arrangørens eget
    // «Neste» blitt lest som en foreldet lenke — utkastet er debounget (og i
    // cup-flyten skrives det aldri), så det finnes ingenting å gjenoppta i
    // det øyeblikket URL-en får ?step=2.
    const { rerender } = renderWizard();

    fireEvent.click(screen.getByRole('radio', { name: /kompis-runde/i }));
    fireEvent.click(screen.getByTestId('wizard-next'));

    expect(push).toHaveBeenCalledWith('/admin/games/new?step=2', { scroll: false });

    // Router-en har nå committet ?step=2 (mocken speiler den ekte). Skallet
    // re-rendres med den nye URL-en — som før #1383 ikke skjedde i noen test.
    rerender(wizardElement());

    expect(replace).not.toHaveBeenCalled();
  });

  it('sender blank flyt tilbake til steg 1 og beholder øvrige søke-parametre', () => {
    // Delt/bokmerket lenke åpnet i fersk fane: ingenting i sessionStorage,
    // ingen forvalg fra ruta — steg 5 ville vist defaults arrangøren aldri
    // har valgt.
    searchString = 'intent=cup&step=5';
    renderWizard();

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/admin/games/new?intent=cup', {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('GameWizard — #1653 ett-felts bane-seed hever taket til steg 2', () => {
  // Et `?bane=`-seed dekker banen og ingenting annet. Før #1653 slo ethvert
  // seedet felt av #1383-reset-en helt, så en delt `?bane=…&step=5`-lenke
  // landet arrangøren i «Klar?» med et default-format ingen hadde valgt —
  // nøyaktig plagen #1383 skulle fjerne.
  it.each(['step=5', 'step=4', 'step=3'])(
    'resetter %s til steg 1 og lar ?bane= stå',
    (step) => {
      searchString = `bane=course-1&${step}`;
      renderWizard(SEEDED_BY_ROUTE);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/admin/games/new?bane=course-1', {
        scroll: false,
      });
      expect(push).not.toHaveBeenCalled();
    },
  );

  it('beholder ?step=2 — bane-seeden rettferdiggjør format-steget', () => {
    searchString = 'bane=course-1&step=2';
    renderWizard(SEEDED_BY_ROUTE);

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('rører ikke cup-formet seed på ?step=5 — forvalgene er bevisst sendt inn', () => {
    searchString = 'step=5';
    renderWizard(SEEDED_BY_CUP);

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('GameWizard — #1385 gjenopptatt utkast', () => {
  it('åpner på steg 5 med radens verdier, ikke et gammelt lokalt utkast', async () => {
    // Utkastet ble lagret i veiviseren, arrangøren klikker «Rediger utkast»
    // (`?step=5`). To ting må holde: steg-5-lenken skal ikke leses som
    // foreldet (raden seeder flyten), og et sessionStorage-utkast fra tidligere
    // i økta skal IKKE legge seg over det serveren nettopp leverte —
    // kontekst-fingeravtrykket er identisk for to besøk på samme utkast, så
    // uten seed-skippet ville den lokale payloaden vunnet.
    const { saveWizardDraft, wizardDraftContext, wizardDraftStorageKey } =
      await import('./wizardStatePersistence');

    // Utkastet er en 2-spillers singles matchplay: formatet passer nøyaktig 2,
    // så det er nettopp dette utkastet #373-telleren ville filtrert bort hvis
    // den sto på default-4 (steg 2 uten valgt kort, og neste klikk bytter
    // game_mode for godt).
    const initialValues = {
      name: 'Serverutkastet',
      game_mode: 'singles_matchplay' as const,
      lock_game_mode: false,
      course_id: 'course-1',
      tee_box_id: 'tee-1',
      players: [
        { user_id: 'u0', team_number: 1, flight_number: null },
        { user_id: 'u1', team_number: 2, flight_number: null },
      ],
    };

    saveWizardDraft(
      wizardDraftStorageKey('/admin/games/new'),
      {
        intent: 'kompis',
        expectedPlayerCount: 4,
        nameTouched: true,
        values: { name: 'Gammelt lokalt utkast', game_mode: 'stableford' },
      },
      wizardDraftContext({ initialIntent: 'kompis', initialValues }),
    );

    searchString = 'step=5';
    renderWizard({
      mode: {
        kind: 'edit-draft',
        gameId: 'game-1',
        saveDraftAction: async () => {},
        publishAction: async () => {},
      },
      initialValues,
      initialIntent: 'kompis',
      // Det ruta seeder: `resumeExpectedPlayerCount('singles_matchplay', 2)`.
      initialExpectedPlayerCount: 2,
      formatsByIntent: {
        ...FORMATS_BY_INTENT,
        kompis: [
          formatRow('stableford', 10),
          formatRow('best_ball', 20),
          formatRow('singles_matchplay', 30),
        ],
      },
    });

    const stepLabel = Array.from(document.querySelectorAll('span')).find(
      (el) => el.textContent === 'Steg 5 av 5',
    );
    expect(stepLabel, 'Forventet «Steg 5 av 5» i DOM').toBeTruthy();
    expect(replace).not.toHaveBeenCalled();

    expect(screen.getByText('Serverutkastet')).toBeTruthy();
    expect(screen.queryByText('Gammelt lokalt utkast')).toBeNull();

    // Tilbake til steg 2: utkastets eget format må stå der, og stå valgt.
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));
    fireEvent.click(screen.getByRole('button', { name: /forrige/i }));

    const formatCard = screen.getByRole('radio', { name: /^matchplay$/i });
    expect(formatCard.getAttribute('aria-checked')).toBe('true');
  });
});
