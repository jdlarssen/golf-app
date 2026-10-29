import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { SimilarCoursesPanel, SEARCH_DEBOUNCE_MS } from './SimilarCoursesPanel';
import type { SimilarCourse } from '@/lib/courses/similarCourses';

const findSimilarCourses = vi.fn<(query: string) => Promise<SimilarCourse[]>>();
vi.mock('@/lib/courses/similarCourses', () => ({
  findSimilarCourses: (query: string) => findSimilarCourses(query),
}));

const NORTH: SimilarCourse = {
  id: 'north',
  name: 'Byneset North',
  holeCount: 18,
  par: 72,
  teeCount: 3,
  roundCount: 41,
};
const SOUTH: SimilarCourse = {
  id: 'south',
  name: 'Byneset South',
  holeCount: 18,
  par: 70,
  teeCount: 2,
  roundCount: 6,
};
const STIKLESTAD: SimilarCourse = {
  id: 'stiklestad',
  name: 'Stiklestad Golfbane',
  holeCount: 9,
  par: 35,
  teeCount: 1,
  roundCount: 0,
};

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  findSimilarCourses.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SimilarCoursesPanel', () => {
  it('does not search under three characters', async () => {
    findSimilarCourses.mockResolvedValue([NORTH]);
    const { container } = render(<SimilarCoursesPanel query="By" target={{ kind: 'wizard' }} />);
    await settle();
    expect(findSimilarCourses).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('waits for the pause after typing, then lists the matches as the artboard draws them', async () => {
    findSimilarCourses.mockResolvedValue([NORTH, SOUTH]);
    render(<SimilarCoursesPanel query="Byneset n" target={{ kind: 'wizard' }} />);
    expect(findSimilarCourses).not.toHaveBeenCalled();
    await settle();
    expect(findSimilarCourses).toHaveBeenCalledWith('Byneset n');

    expect(screen.getByRole('heading', { name: 'Finnes banen alt?' })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Byneset North');
    expect(rows[0]).toHaveTextContent('18 hull · par 72 · tre tee-er · brukt i 41 runder');
    expect(rows[1]).toHaveTextContent('18 hull · par 70 · to tee-er · brukt i 6 runder');
  });

  it('says one tee and not used yet in words', async () => {
    findSimilarCourses.mockResolvedValue([STIKLESTAD]);
    render(<SimilarCoursesPanel query="Stiklestad" target={{ kind: 'wizard' }} />);
    await settle();
    expect(screen.getByRole('listitem')).toHaveTextContent('9 hull · par 35 · én tee · ikke brukt ennå');
  });

  it('shows nothing when there is no match', async () => {
    findSimilarCourses.mockResolvedValue([]);
    const { container } = render(<SimilarCoursesPanel query="Ny bane" target={{ kind: 'wizard' }} />);
    await settle();
    expect(findSimilarCourses).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [{ kind: 'wizard' as const, next: '/opprett-spill?intent=kompis&step=3' }, '/opprett-spill?intent=kompis&step=3&bane=north'],
    [{ kind: 'wizard' as const }, '/opprett-spill?bane=north'],
    [{ kind: 'edit' as const }, '/admin/courses/north/edit'],
  ])('«Bruk denne» for %o goes to %s and names the course', async (target, href) => {
    findSimilarCourses.mockResolvedValue([NORTH]);
    render(<SimilarCoursesPanel query="Byneset" target={target} />);
    await settle();
    const link = screen.getByRole('link', { name: 'Bruk denne: Byneset North' });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveTextContent('Bruk denne');
  });

  it('drops an answer that comes back after a newer search started', async () => {
    let answerOld: (rows: SimilarCourse[]) => void = () => {};
    findSimilarCourses
      .mockImplementationOnce(() => new Promise((resolve) => { answerOld = resolve; }))
      .mockResolvedValueOnce([STIKLESTAD]);

    const { rerender } = render(<SimilarCoursesPanel query="Byneset" target={{ kind: 'wizard' }} />);
    await settle();
    rerender(<SimilarCoursesPanel query="Stiklestad" target={{ kind: 'wizard' }} />);
    await settle();
    expect(screen.getByRole('listitem')).toHaveTextContent('Stiklestad Golfbane');

    await act(async () => {
      answerOld([NORTH]);
    });
    expect(screen.getByRole('listitem')).toHaveTextContent('Stiklestad Golfbane');
    expect(screen.queryByText('Byneset North')).not.toBeInTheDocument();
  });

  it('a new name under three characters clears the old matches', async () => {
    findSimilarCourses.mockResolvedValue([NORTH]);
    const { rerender, container } = render(
      <SimilarCoursesPanel query="Byneset" target={{ kind: 'wizard' }} />,
    );
    await settle();
    expect(screen.getByRole('listitem')).toBeInTheDocument();

    rerender(<SimilarCoursesPanel query="St" target={{ kind: 'wizard' }} />);
    expect(container).toBeEmptyDOMElement();
    findSimilarCourses.mockReturnValue(new Promise(() => {}));
    rerender(<SimilarCoursesPanel query="Sti" target={{ kind: 'wizard' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('«Nei, legg til …» hides the list until the name is a different one', async () => {
    findSimilarCourses.mockResolvedValue([NORTH]);
    const onAddAnyway = vi.fn();
    const { rerender } = render(
      <SimilarCoursesPanel query="Byneset n" target={{ kind: 'wizard' }} onAddAnyway={onAddAnyway} />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Nei, legg til «Byneset n» som ny bane' }));
    expect(onAddAnyway).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    // One more letter: still hidden.
    rerender(<SimilarCoursesPanel query="Byneset no" target={{ kind: 'wizard' }} />);
    await settle();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    // Another name: the list is back.
    findSimilarCourses.mockResolvedValue([STIKLESTAD]);
    rerender(<SimilarCoursesPanel query="Stiklestad" target={{ kind: 'wizard' }} />);
    await settle();
    expect(screen.getByRole('listitem')).toHaveTextContent('Stiklestad Golfbane');
  });

  it('cuts a long name in «Nei, legg til …» at twelve characters', async () => {
    findSimilarCourses.mockResolvedValue([NORTH]);
    render(<SimilarCoursesPanel query="Byneset North Golf" target={{ kind: 'wizard' }} />);
    await settle();
    expect(
      screen.getByRole('button', { name: 'Nei, legg til «Byneset Nort…» som ny bane' }),
    ).toBeInTheDocument();
  });
});
