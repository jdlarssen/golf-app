import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const push = vi.fn();
const replace = vi.fn();
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

function renderWizard() {
  return render(
    <GameWizard
      courses={COURSES}
      players={PLAYERS}
      mode={{ kind: 'create', createDraftAction: NO_OP, createAndPublishAction: NO_OP }}
      formatsByIntent={FORMATS_BY_INTENT}
      friendPlayerIds={PLAYERS.map((p) => p.id)}
    />,
  );
}

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
    renderWizard();

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
    renderWizard();

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
