import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  saveWizardDraft,
  wizardDraftContext,
  wizardDraftStorageKey,
} from '@/app/[locale]/admin/games/new/wizardStatePersistence';

// #2459: the confirmation page for «Slett utkastet». Nothing is deleted before
// the confirm button; a foreign, expired or made-up key deletes nothing.

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => {
  const { createElement } = await import('react');
  return {
    useRouter: () => ({ push }),
    Link: ({ href, children, ...rest }: { href: string; children: unknown; [k: string]: unknown }) =>
      createElement('a', { href, ...rest }, children as never),
  };
});

const { ConfirmDeleteDraft } = await import('./ConfirmDeleteDraft');

const USER = 'user-a';
const KEY = wizardDraftStorageKey(USER, '/opprett-spill');

function seed(userId = USER, path = '/opprett-spill', savedAt = Date.now()) {
  saveWizardDraft(
    wizardDraftStorageKey(userId, path),
    { intent: 'kompis', expectedPlayerCount: 4, nameTouched: false, values: {} },
    wizardDraftContext({}),
    savedAt,
    {
      href: '/opprett-spill?step=3',
      summary: {
        step: 3,
        formatLabel: 'Stableford',
        courseName: 'Stiklestad GK',
        selectedCount: 2,
        expectedCount: 4,
        title: null,
      },
    },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockClear();
});

describe('ConfirmDeleteDraft', () => {
  it('viser oppsummeringen og sletter ingenting før bekreftelsen', async () => {
    seed();
    render(<ConfirmDeleteDraft userId={USER} draftKey={KEY} />);

    expect(await screen.findByText('Slette utkastet?')).toBeInTheDocument();
    expect(screen.getByText('Stableford · Stiklestad GK')).toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it('«Avbryt» går til Hjem og lar utkastet stå', async () => {
    seed();
    render(<ConfirmDeleteDraft userId={USER} draftKey={KEY} />);

    const cancel = await screen.findByTestId('delete-draft-cancel');
    expect(cancel.getAttribute('href')).toBe('/');
    expect(window.localStorage.getItem(KEY)).not.toBeNull();
  });

  it('«Slett utkastet» fjerner utkastet og sender deg til Hjem', async () => {
    seed();
    render(<ConfirmDeleteDraft userId={USER} draftKey={KEY} />);

    fireEvent.click(await screen.findByTestId('delete-draft-confirm'));

    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith('/');
  });

  it('en annen brukers nøkkel gir «finnes ikke» og sletter ingenting', async () => {
    seed('user-b');
    const foreign = wizardDraftStorageKey('user-b', '/opprett-spill');
    render(<ConfirmDeleteDraft userId={USER} draftKey={foreign} />);

    expect(await screen.findByTestId('delete-draft-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('delete-draft-confirm')).toBeNull();
    expect(window.localStorage.getItem(foreign)).not.toBeNull();
  });

  it('en nøkkel som ikke er et utkast gir «finnes ikke» og rører ikke annen lagring', async () => {
    window.localStorage.setItem('noe-annet', 'x');
    render(<ConfirmDeleteDraft userId={USER} draftKey="noe-annet" />);

    expect(await screen.findByTestId('delete-draft-missing')).toBeInTheDocument();
    expect(window.localStorage.getItem('noe-annet')).toBe('x');
  });

  it('et utgått utkast gir «finnes ikke»', async () => {
    seed(USER, '/opprett-spill', Date.now() - 8 * 24 * 60 * 60 * 1000);
    render(<ConfirmDeleteDraft userId={USER} draftKey={KEY} />);

    expect(await screen.findByTestId('delete-draft-missing')).toBeInTheDocument();
  });

  it('uten nøkkel i adressen sier siden at utkastet ikke finnes', async () => {
    render(<ConfirmDeleteDraft userId={USER} draftKey="" />);

    expect(await screen.findByTestId('delete-draft-missing')).toBeInTheDocument();
  });
});
