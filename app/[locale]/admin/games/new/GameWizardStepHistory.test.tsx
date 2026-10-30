import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { Activity, type ComponentProps } from 'react';
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
      backHref="/admin/games"
      currentUserId="user-1"
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
  window.localStorage.clear();
});

describe('GameWizard — #1380 per-steg history', () => {
  it('steg-overgang arrangøren utløser pusher en history-entry', () => {
    renderWizard();

    // #1794: arrangements-flisen går rett videre — klikket ER steg-overgangen,
    // og den skal fortsatt pushe så browser-back angrer valget.
    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));

    expect(push).toHaveBeenCalledWith('/admin/games/new?step=2', { scroll: false });
    expect(replace).not.toHaveBeenCalled();
  });

  // #1837: overgangen unmounter flisen som ble klikket, så fokus falt til
  // <body> — tastaturbrukere måtte tabbe fra toppen igjen, og ingen
  // skjermleser sa at steget byttet. Fokus skal ligge på steg-overskriften.
  it('auto-videre flytter fokus til steg-overskriften', () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));

    const heading = screen.getByRole('heading', { name: 'Hva skal dere spille?' });
    expect(document.activeElement).toBe(heading);
    // Annonseringen står på egne ben: telleren er overskriftens beskrivelse.
    expect(document.getElementById(heading.getAttribute('aria-describedby')!))
      .toHaveTextContent('Steg 2 av 5');
  });

  it('«Tilbake» pusher også — hvert steg er sin egen history-entry', () => {
    searchString = 'step=2';
    renderWizard(SEEDED_BY_ROUTE);

    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));

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
    // steg-1-klikk blitt lest som en foreldet lenke — utkastet er debounget (og i
    // cup-flyten skrives det aldri), så det finnes ingenting å gjenoppta i
    // det øyeblikket URL-en får ?step=2.
    const { rerender } = renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /kompis-runde/i }));

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
  // #2485: `?bane=` leaves the address with `step`. The seed has already
  // chosen the course, and a `bane` left behind would later go over the
  // organiser's own choice when a draft is restored (useCourseFromUrl never
  // runs on a reset mount).
  it.each(['step=5', 'step=4', 'step=3'])(
    'resetter %s til steg 1; banen er seedet, og ?bane= går ut av adressen',
    (step) => {
      searchString = `bane=course-1&${step}`;
      renderWizard(SEEDED_BY_ROUTE);

      expect(replace).toHaveBeenCalledTimes(1);
      // `banevalg=1` keeps «a link chose the course» for «Som sist» (#2446).
      expect(replace).toHaveBeenCalledWith('/admin/games/new?banevalg=1', {
        scroll: false,
      });
      expect(push).not.toHaveBeenCalled();
      expect(
        document.querySelector<HTMLInputElement>('input[type=hidden][name=course_id]')!.value,
      ).toBe('course-1');
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
  // #2446: «Bruk samme oppsett» on the «Som sist» card links to
  // `?sist=<id>&step=5`. The prefill is the revansje one (course, tee, format,
  // players) plus the new tee-off, which the ceiling ignores. Infinity, so
  // «Klar?» stays.
  it('«Som sist»-seed beholder ?step=5', () => {
    searchString = 'sist=g1&step=5';
    renderWizard({
      initialIntent: 'kompis',
      initialValues: {
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        game_mode: 'stableford',
        lock_game_mode: false,
        players: [{ user_id: 'u0', team_number: null, flight_number: null }],
      },
    });

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText('Steg 5 av 5')).toBeInTheDocument();
  });

  // #2328: `?format=` from the format helper on /spillformater seeds the
  // format and nothing else, so it lands on step 2 and no further.
  it('format-seed lander på ?step=2', () => {
    searchString = 'format=texas_scramble&step=2';
    renderWizard({ initialValues: { game_mode: 'texas_scramble' }, initialIntent: 'kompis' });

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  // #2485: back from /opprett-bane on a format link, `?bane=` comes with
  // `?format=`. Course and format are chosen, so step 3 is fine; step 4 is not.
  it('bane + format-seed lander på ?step=3', () => {
    searchString = 'format=texas_scramble&step=3&bane=course-1';
    renderWizard({
      initialValues: { game_mode: 'texas_scramble', course_id: 'course-1' },
      initialIntent: 'kompis',
    });

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('bane + format-seed på ?step=4 sendes til steg 1', () => {
    searchString = 'format=texas_scramble&step=4&bane=course-1';
    renderWizard({
      initialValues: { game_mode: 'texas_scramble', course_id: 'course-1' },
      initialIntent: 'kompis',
    });

    expect(replace).toHaveBeenCalledTimes(1);
    // `bane` goes with `step` (the seed has the course already); `banevalg`
    // stays as the trace for «Som sist».
    expect(replace).toHaveBeenCalledWith('/admin/games/new?format=texas_scramble&banevalg=1', {
      scroll: false,
    });
  });

  it('format-seed på ?step=4 sendes til steg 1 og lar ?format= stå', () => {
    searchString = 'format=texas_scramble&step=4';
    renderWizard({ initialValues: { game_mode: 'texas_scramble' }, initialIntent: 'kompis' });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/admin/games/new?format=texas_scramble', {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('GameWizard — #2331 oppsett-forvalget fra guidene', () => {
  // «Bruk dette oppsettet» on the guides seeds the format and the team size
  // (plus the tee-off suggestion every new game gets). Like `?format=` it
  // lands on step 2 and no further: steps 3+ need a course and players no one
  // has chosen.
  const PRESET: Partial<WizardProps> = {
    initialValues: {
      game_mode: 'texas_scramble',
      team_size: 4,
      scheduled_tee_off_at: '2026-10-31T09:00',
    },
    initialIntent: 'kompis',
    initialExpectedPlayerCount: null,
    formatsByIntent: {
      ...FORMATS_BY_INTENT,
      kompis: [...FORMATS_BY_INTENT.kompis, formatRow('texas_scramble', 30)],
    },
  };

  it('lander på ?step=2', () => {
    searchString = 'oppsett=firmagolf&step=2';
    renderWizard(PRESET);

    expect(replace).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('?step=5 sendes til steg 1 og lar ?oppsett= stå', () => {
    searchString = 'oppsett=firmagolf&step=5';
    renderWizard(PRESET);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/admin/games/new?oppsett=firmagolf', {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('«Neste» fra steg 2 til 3 kaster ikke arrangøren tilbake', () => {
    searchString = 'oppsett=firmagolf&step=2';
    const { rerender } = renderWizard(PRESET);

    fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));

    expect(push).toHaveBeenCalledWith('/admin/games/new?oppsett=firmagolf&step=3', {
      scroll: false,
    });
    // The router has committed ?step=3; the shell re-renders with it.
    rerender(wizardElement(PRESET));

    expect(replace).not.toHaveBeenCalled();
  });

  it('et forvalg med bare game_mode gir også tak 2', () => {
    searchString = 'step=2';
    renderWizard({ ...PRESET, initialValues: { game_mode: 'texas_scramble' } });
    expect(replace).not.toHaveBeenCalled();

    searchString = 'step=3';
    renderWizard({ ...PRESET, initialValues: { game_mode: 'texas_scramble' } });
    expect(replace).toHaveBeenCalledWith('/admin/games/new', { scroll: false });
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
      wizardDraftStorageKey('user-1', '/admin/games/new'),
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

    // #1999: navnet på steg 5 er nå et vanlig tekstfelt, ikke en
    // klikk-for-å-redigere-tekst — verdien leses av feltet, ikke av DOM-teksten.
    expect(screen.getByLabelText(/^navn på runden$/i)).toHaveValue('Serverutkastet');

    // Tilbake til steg 2: utkastets eget format må stå der, og stå valgt.
    // #2321: fra steg 5 går «Tilbake» til side-skjermen (singles matchplay med
    // to valgte), så til velgeren, så til steg 3.
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    expect(screen.getByRole('heading', { name: /^sider$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));

    const formatCard = screen.getByRole('radio', { name: /^matchplay$/i });
    expect(formatCard.getAttribute('aria-checked')).toBe('true');
  });
  // #2282: «Endre» i sjekklista er en steg-handler som alle andre — den pusher
  // URL-en, så Tilbake i nettleseren lander på «Klar?» igjen.
  it('«Endre» på Bane går til steg 3 med push, og tilbake gir steg 5', () => {
    const props: Partial<WizardProps> = {
      mode: {
        kind: 'edit-draft',
        gameId: 'game-1',
        saveDraftAction: async () => {},
        publishAction: async () => {},
      },
      initialValues: {
        name: 'Serverutkastet',
        game_mode: 'singles_matchplay',
        lock_game_mode: false,
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        players: [
          { user_id: 'u0', team_number: 1, flight_number: null },
          { user_id: 'u1', team_number: 2, flight_number: null },
        ],
      },
      initialIntent: 'kompis',
      initialExpectedPlayerCount: 2,
    };
    searchString = 'step=5';
    const { rerender } = renderWizard(props);
    const stepIs = (n: number) =>
      Array.from(document.querySelectorAll('span')).some(
        (el) => el.textContent === `Steg ${n} av 5`,
      );
    expect(stepIs(5)).toBe(true);

    fireEvent.click(within(screen.getByTestId('ready-row-course')).getByRole('button'));

    expect(push).toHaveBeenCalledWith('/admin/games/new?step=3', { scroll: false });
    expect(stepIs(3)).toBe(true);

    // Nettleserens Tilbake: router-en committer forrige URL, skallet
    // re-rendres med den.
    searchString = 'step=5';
    rerender(wizardElement(props));
    expect(stepIs(5)).toBe(true);
  });
  // #2566 (guard, green before the fix): a draft resumed in the wizard shows
  // the stored team handicap (% of the sum) as % of the team average on «Klar?»,
  // like the edit form does. Keeps the two surfaces from drifting apart again.
  it('gjenopptatt Texas-utkast (3-mannslag, 26.67) viser 80 og sum-hjelpeteksten på steg 5', () => {
    const six: PlayerOption[] = Array.from({ length: 6 }, (_, i) => ({
      ...PLAYERS[0],
      id: `u${i}`,
      name: `Spiller ${i + 1}`,
      email: `u${i}@example.com`,
    }));
    searchString = 'step=5';
    renderWizard({
      players: six,
      friendPlayerIds: six.map((p) => p.id),
      mode: {
        kind: 'edit-draft',
        gameId: 'game-1',
        saveDraftAction: async () => {},
        publishAction: async () => {},
      },
      initialValues: {
        name: 'Lagkampen',
        game_mode: 'texas_scramble',
        lock_game_mode: false,
        course_id: 'course-1',
        tee_box_id: 'tee-1',
        team_size: 3,
        texas_team_handicap_pct: '26.67',
        players: six.map((p, i) => ({
          user_id: p.id,
          team_number: i < 3 ? 1 : 2,
          flight_number: i < 3 ? 1 : 2,
        })),
      },
      initialIntent: 'kompis',
      initialExpectedPlayerCount: 6,
      formatsByIntent: {
        ...FORMATS_BY_INTENT,
        kompis: [...FORMATS_BY_INTENT.kompis, formatRow('texas_scramble', 30)],
      },
    });

    const stepLabel = Array.from(document.querySelectorAll('span')).find(
      (el) => el.textContent === 'Steg 5 av 5',
    );
    expect(stepLabel, 'Forventet «Steg 5 av 5» i DOM').toBeTruthy();

    // The team handicap sits under «Vis avanserte innstillinger».
    fireEvent.click(screen.getByRole('button', { name: /avanserte innstillinger/i }));
    const input = document.getElementById('texas_team_handicap_pct__input') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('80');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    const hint = document.getElementById(input.getAttribute('aria-describedby')!.split(' ')[0]);
    expect(hint?.textContent).toContain('26,7');
    // The wizard's central hidden field still sends the stored value.
    expect(
      (document.querySelector('input[type=hidden][name=texas_team_handicap_pct]') as HTMLInputElement).value,
    ).toBe('26.67');
  });
});

describe('GameWizard — #2321 steg 4s andre skjerm (lag og sider)', () => {
  const FOUR: PlayerOption[] = ['u0', 'u1', 'u2', 'u3'].map((id, i) => ({
    ...PLAYERS[0],
    id,
    name: `Spiller ${i + 1}`,
    email: `${id}@example.com`,
  }));

  const FORMATS = {
    ...FORMATS_BY_INTENT,
    kompis: [...FORMATS_BY_INTENT.kompis, formatRow('singles_matchplay', 30)],
  };

  type DraftValues = Parameters<typeof import('./wizardStatePersistence').saveWizardDraft>[1]['values'];

  async function seedDraft(values: DraftValues) {
    const { saveWizardDraft, wizardDraftContext, wizardDraftStorageKey } = await import(
      './wizardStatePersistence'
    );
    saveWizardDraft(
      wizardDraftStorageKey('user-1', '/admin/games/new'),
      { intent: 'kompis', expectedPlayerCount: 4, nameTouched: false, values },
      wizardDraftContext({}),
    );
  }

  const BEST_BALL_FOUR: DraftValues = {
    game_mode: 'best_ball',
    team_size: 2,
    players: [
      { user_id: 'u0', team_number: 1, flight_number: 1 },
      { user_id: 'u1', team_number: 1, flight_number: 1 },
      { user_id: 'u2', team_number: 2, flight_number: 1 },
      { user_id: 'u3', team_number: 2, flight_number: 1 },
    ],
  };

  function element() {
    return wizardElement({
      players: FOUR,
      friendPlayerIds: FOUR.map((p) => p.id),
      formatsByIntent: FORMATS,
    });
  }

  it('«Neste: lagene» (best ball) pusher ?step=4&skjerm=lag, og tilbakepila pusher ?step=4', async () => {
    await seedDraft(BEST_BALL_FOUR);
    searchString = 'step=4';
    render(element());

    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));
    expect(push).toHaveBeenLastCalledWith('/admin/games/new?step=4&skjerm=lag', { scroll: false });
    expect(screen.getByRole('heading', { name: /^lag$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    expect(push).toHaveBeenLastCalledWith('/admin/games/new?step=4', { scroll: false });
    expect(screen.queryByRole('heading', { name: /^lag$/i })).toBeNull();
  });

  it('«Neste: sidene» (singles matchplay) pusher ?step=4&skjerm=lag', async () => {
    await seedDraft({
      game_mode: 'singles_matchplay',
      team_size: 1,
      players: [
        { user_id: 'u0', team_number: null, flight_number: null },
        { user_id: 'u1', team_number: null, flight_number: null },
      ],
    });
    searchString = 'step=4';
    render(element());

    fireEvent.click(screen.getByRole('button', { name: /^neste: sidene$/i }));
    expect(push).toHaveBeenLastCalledWith('/admin/games/new?step=4&skjerm=lag', { scroll: false });
    expect(screen.getByRole('heading', { name: /^sider$/i })).toBeInTheDocument();
  });

  it('en URL-endring tilbake til ?step=4 viser velgeren', async () => {
    await seedDraft(BEST_BALL_FOUR);
    searchString = 'step=4';
    const { rerender } = render(element());
    fireEvent.click(screen.getByRole('button', { name: /^neste: lagene$/i }));
    expect(screen.getByRole('heading', { name: /^lag$/i })).toBeInTheDocument();

    // Nettleserens tilbake: router-en har committet ?step=4.
    searchString = 'step=4';
    rerender(element());

    expect(screen.queryByRole('heading', { name: /^lag$/i })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /spiller 1/i })).toBeChecked();
  });

  it('«Neste» på lag-skjermen pusher ?step=5 uten skjerm, og tilbakepila på steg 5 pusher ?step=4&skjerm=lag', async () => {
    await seedDraft(BEST_BALL_FOUR);
    searchString = 'step=4&skjerm=lag';
    render(element());
    expect(screen.getByRole('heading', { name: /^lag$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^neste$/i }));
    expect(push).toHaveBeenLastCalledWith('/admin/games/new?step=5', { scroll: false });

    fireEvent.click(screen.getByRole('button', { name: /^tilbake$/i }));
    expect(push).toHaveBeenLastCalledWith('/admin/games/new?step=4&skjerm=lag', { scroll: false });
  });

  it('en foreldet ?step=4&skjerm=lag uten utkast og forvalg rettes med én replace uten step og skjerm', () => {
    searchString = 'step=4&skjerm=lag';
    render(element());

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/admin/games/new', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('et lagret stableford-utkast på ?step=4&skjerm=lag rettes til ?step=4 når utkastet er hentet', async () => {
    await seedDraft({
      game_mode: 'stableford',
      team_size: 1,
      players: [{ user_id: 'u0', team_number: null, flight_number: null }],
    });
    searchString = 'step=4&skjerm=lag';
    render(element());

    expect(replace).toHaveBeenCalledWith('/admin/games/new?step=4', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('et lagret best ball-utkast med fire valgt viser lag-skjermen etter reload uten replace', async () => {
    await seedDraft(BEST_BALL_FOUR);
    searchString = 'step=4&skjerm=lag';
    render(element());

    expect(screen.getByRole('heading', { name: /^lag$/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

// #2485: `?bane=` (back from /opprett-bane) chooses the course and then leaves
// the address. Next 16 keeps a visited route mounted, so the way back often
// reuses the wizard that was there: the course must land on a mounted wizard
// too, not only on a fresh mount. `rerender` with a new search string is that
// kept instance.
describe('GameWizard — #2485 ?bane= velger banen og forsvinner fra adressen', () => {
  const TWO_TEES: CourseOption = {
    id: 'course-2',
    name: 'Byneset Golfklubb',
    tee_boxes: [
      { id: 'tee-2a', name: 'Gul', has_mens: true, has_ladies: false, has_juniors: false },
      { id: 'tee-2b', name: 'Rød', has_mens: true, has_ladies: false, has_juniors: false },
    ],
  };
  const COURSES_TWO = [...COURSES, TWO_TEES];

  async function seedDraft() {
    const { saveWizardDraft, wizardDraftContext, wizardDraftStorageKey } = await import(
      './wizardStatePersistence'
    );
    saveWizardDraft(
      wizardDraftStorageKey('user-1', '/admin/games/new'),
      {
        intent: 'kompis',
        expectedPlayerCount: 4,
        nameTouched: false,
        values: {
          game_mode: 'stableford',
          team_size: 1,
          course_id: 'course-1',
          tee_box_id: 'tee-1',
          players: [{ user_id: 'u0', team_number: null, flight_number: null }],
        },
      },
      wizardDraftContext({}),
    );
  }

  const courseInput = () =>
    document.querySelector<HTMLInputElement>('input[type=hidden][name=course_id]')!;
  const teeInput = () =>
    document.querySelector<HTMLInputElement>('input[type=hidden][name=tee_box_id]')!;
  const gameModeInput = () =>
    document.querySelector<HTMLInputElement>('input[type=hidden][name=game_mode]')!;

  let replaceState: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // The hook strips `bane` with Next's patched history.replaceState; here it
    // writes back to the mocked search string, as the router would.
    replaceState = vi
      .spyOn(window.history, 'replaceState')
      .mockImplementation((_data, _unused, url) => {
        searchString = new URL(String(url), 'http://localhost').search.replace(/^\?/, '');
      });
  });
  afterEach(() => {
    replaceState.mockRestore();
  });

  const element = () => wizardElement({ courses: COURSES_TWO });

  it('går over utkastets bane ved montering, og formatet står', async () => {
    await seedDraft();
    searchString = 'step=3&bane=course-2';
    render(element());

    await waitFor(() => expect(courseInput().value).toBe('course-2'));
    expect(teeInput().value).toBe('');
    expect(gameModeInput().value).toBe('stableford');
    await waitFor(() => expect(searchString).toBe('step=3&banevalg=1'));
  });

  it('virker på en veiviser som alt er montert, også med samme bane to ganger', async () => {
    await seedDraft();
    searchString = 'step=3';
    const { rerender } = render(element());
    await waitFor(() => expect(courseInput().value).toBe('course-1'));

    searchString = 'step=3&bane=course-2';
    rerender(element());
    await waitFor(() => expect(courseInput().value).toBe('course-2'));
    await waitFor(() => expect(searchString).toBe('step=3&banevalg=1'));
    rerender(element());

    // The organiser changes the course by hand, then comes back with course-2 again.
    fireEvent.change(screen.getByLabelText(/^bane$/i), { target: { value: 'course-1' } });
    expect(courseInput().value).toBe('course-1');
    searchString = 'step=3&bane=course-2';
    rerender(element());
    await waitFor(() => expect(courseInput().value).toBe('course-2'));
  });

  it('en reload uten ?bane= beholder utkastets bane', async () => {
    await seedDraft();
    searchString = 'step=3';
    render(element());
    await waitFor(() => expect(courseInput().value).toBe('course-1'));
    expect(teeInput().value).toBe('tee-1');
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('en ukjent bane velger ingenting, men forsvinner fra adressen', async () => {
    await seedDraft();
    searchString = 'step=3&bane=gone';
    render(element());
    await waitFor(() => expect(searchString).toBe('step=3&banevalg=1'));
    expect(courseInput().value).toBe('course-1');
  });

  // Found on staging: the wizard mounted with no draft, then stayed mounted
  // but hidden while the organiser was on /opprett-bane. On reveal the effects
  // run again, the shell finds the draft for the first time and remounts the
  // body from it. The URL's course must survive that remount.
  it('en skjult veiviser som finner utkastet først ved avsløring, får likevel banen', async () => {
    searchString = 'step=1';
    const hidden = (mode: 'visible' | 'hidden') => <Activity mode={mode}>{element()}</Activity>;
    const { rerender } = render(hidden('visible'));
    rerender(hidden('hidden'));
    await seedDraft();
    searchString = 'step=3&bane=course-2';
    rerender(hidden('hidden'));
    rerender(hidden('visible'));
    // (The body's step guard sends the empty mount back to step 1, so only
    // `bane` is asserted on the address.)
    await waitFor(() => expect(searchString).not.toMatch(/(^|&)bane=/));
    expect(searchString).toContain('banevalg=1');
    await waitFor(() => expect(courseInput().value).toBe('course-2'));
    expect(gameModeInput().value).toBe('stableford');
  });

  // Round-2 evaluator: a stale `?bane=X&step=5` with no draft resets to step 1.
  // If `bane` stayed, the next draft restore would put X over the course the
  // organiser chose afterwards.
  it('en foreldet ?bane=…&step=5 uten utkast legger ikke banen over et senere valg', async () => {
    searchString = 'bane=course-2&step=5';
    const { unmount } = render(element());
    expect(searchString).toBe('banevalg=1');
    unmount();
    // The organiser chose course-1 on step 3 (the draft), then reloads.
    await seedDraft();
    render(element());
    await waitFor(() => expect(courseInput().value).toBe('course-1'));
    expect(teeInput().value).toBe('tee-1');
  });

  it('uten utkast (cup-lenka skriver ingen) velger den banen på den monterte veiviseren', async () => {
    searchString = 'step=5';
    const props = {
      courses: COURSES_TWO,
      initialValues: { tournament_id: 't1', game_mode: 'stableford' as const, lock_game_mode: true },
    };
    const { rerender } = render(wizardElement(props));
    searchString = 'step=3&bane=course-2';
    rerender(wizardElement(props));
    await waitFor(() => expect(courseInput().value).toBe('course-2'));
  });
});
