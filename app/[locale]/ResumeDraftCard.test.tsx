import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ResumeDraftCard } from './ResumeDraftCard';
import {
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftStorageKey,
  type WizardDraft,
  type WizardDraftSummary,
} from './admin/games/new/wizardStatePersistence';

// #2459: «Fortsett der du slapp» on Home. The draft lives in localStorage, so
// the card is client-only and shows up after mount. Type B: the rendered card.

const USER = 'user-a';
const DRAFT: WizardDraft = {
  intent: 'kompis',
  expectedPlayerCount: 4,
  nameTouched: false,
  values: {},
};

function seed(
  summary: Partial<WizardDraftSummary> = {},
  opts: { userId?: string; path?: string; href?: string; savedAt?: number } = {},
) {
  saveWizardDraft(
    wizardDraftStorageKey(opts.userId ?? USER, opts.path ?? '/opprett-spill'),
    DRAFT,
    wizardDraftContext({}),
    opts.savedAt ?? Date.now(),
    {
      href: opts.href ?? '/opprett-spill?intent=kompis&step=4',
      summary: {
        step: 4,
        formatLabel: 'Stableford',
        courseName: 'Stiklestad GK',
        selectedCount: 3,
        expectedCount: 4,
        title: null,
        ...summary,
      },
    },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ResumeDraftCard', () => {
  it('viser format, bane, spillere mot antallet og steget du var på', async () => {
    seed();
    render(<ResumeDraftCard userId={USER} />);

    expect(await screen.findByTestId('resume-draft-card')).toBeInTheDocument();
    expect(screen.getByText('Fortsett der du slapp')).toBeInTheDocument();
    expect(screen.getByText('Nytt spill')).toBeInTheDocument();
    expect(screen.getByText('Stableford · Stiklestad GK · 3 av 4 spillere')).toBeInTheDocument();
    expect(screen.getByText('Steg 4 av 5 · Hvem skal spille?')).toBeInTheDocument();
  });

  it('«Fortsett» lenker til den lagrede lenka, med steg og kontekst', async () => {
    seed({}, { href: '/opprett-spill?intent=kompis&klubb=k1&step=4&skjerm=lag' });
    render(<ResumeDraftCard userId={USER} />);

    const link = await screen.findByTestId('resume-draft-continue');
    expect(link.getAttribute('href')).toBe(
      '/opprett-spill?intent=kompis&klubb=k1&step=4&skjerm=lag',
    );
    expect(link.className).toContain('h-12');
  });

  it('«Slett utkastet» lenker til bekreftelsessiden med nøkkelen', async () => {
    seed();
    render(<ResumeDraftCard userId={USER} />);

    const link = await screen.findByTestId('resume-draft-delete');
    expect(link.getAttribute('href')).toBe(
      `/opprett-spill/slett-utkast?utkast=${encodeURIComponent(
        wizardDraftStorageKey(USER, '/opprett-spill'),
      )}`,
    );
    expect(link.className).toContain('h-12');
  });

  it('bruker spillnavnet som tittel når arrangøren har skrevet det', async () => {
    seed({ title: 'Lørdagsrunden' });
    render(<ResumeDraftCard userId={USER} />);

    expect(await screen.findByText('Lørdagsrunden')).toBeInTheDocument();
    expect(screen.queryByText('Nytt spill')).toBeNull();
  });

  it('utelater det som mangler, og sier «N spillere» uten antall', async () => {
    seed({ formatLabel: null, courseName: null, expectedCount: null, selectedCount: 3, step: 2 });
    render(<ResumeDraftCard userId={USER} />);

    expect(await screen.findByText('3 spillere')).toBeInTheDocument();
    expect(screen.getByText('Steg 2 av 5 · Hva skal dere spille?')).toBeInTheDocument();
  });

  it('viser ikke kortet for et utkast som bare har arrangementstypen (steg 1)', async () => {
    seed({ step: 1, formatLabel: null, courseName: null });
    render(<ResumeDraftCard userId={USER} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('resume-draft-card')).toBeNull();
  });

  it('viser aldri en annen brukers utkast', async () => {
    seed({}, { userId: 'user-b' });
    render(<ResumeDraftCard userId={USER} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('resume-draft-card')).toBeNull();
  });

  it('viser ikke et utkast eldre enn 7 døgn', async () => {
    seed({}, { savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    render(<ResumeDraftCard userId={USER} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('resume-draft-card')).toBeNull();
  });

  it('viser det nyeste når det finnes ett per flate', async () => {
    seed({ courseName: 'Eldre bane' }, { path: '/admin/games/new', savedAt: Date.now() - 5000 });
    seed({ courseName: 'Nyere bane' }, { path: '/opprett-spill', savedAt: Date.now() });
    render(<ResumeDraftCard userId={USER} />);

    await waitFor(() =>
      expect(screen.getByText(/Nyere bane/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Eldre bane/)).toBeNull();
  });

  it('rendrer ingenting på serveren og i første klient-render, selv med et utkast lagret', () => {
    seed();
    // renderToString runs no effects: this is exactly the markup hydration sees.
    expect(renderToString(<ResumeDraftCard userId={USER} />)).toBe('');
  });
});
