// native/app/src/components/course/SimilarCoursesPanel.test.tsx
// #2757: «Finnes banen alt?» (Type C): tre tegn før søk, eldre svar kastes, og
// «Nei …» skjuler lista til navnet er et annet.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchSimilarCourses, type SimilarCourse } from '../../data/similarCourses';
import { SEARCH_DEBOUNCE_MS, SimilarCoursesPanel } from './SimilarCoursesPanel';

jest.mock('../../data/similarCourses', () => ({
  fetchSimilarCourses: jest.fn(),
}));

const fetchMock = fetchSimilarCourses as jest.Mock;

const BYNESET: SimilarCourse = {
  id: 'c1',
  name: 'Byneset Golfklubb',
  holeCount: 18,
  par: 72,
  teeCount: 2,
  roundCount: 41,
};

const settle = async (ms = SEARCH_DEBOUNCE_MS) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SimilarCoursesPanel', () => {
  it('spør ikke under tre tegn', async () => {
    await render(<SimilarCoursesPanel query="by" onUse={jest.fn()} />);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('similar-courses')).toBeNull();
  });

  it('venter på pausen, viser radene, og et trykk bruker banen', async () => {
    fetchMock.mockResolvedValue([BYNESET]);
    const onUse = jest.fn();
    await render(<SimilarCoursesPanel query="byneset" onUse={onUse} />);
    await settle(SEARCH_DEBOUNCE_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await settle(1);
    expect(fetchMock).toHaveBeenCalledWith('byneset');

    expect(screen.getByText('18 hull · par 72 · to tee-er · brukt i 41 runder')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('similar-course-c1'));
    expect(onUse).toHaveBeenCalledWith('c1');
  });

  it('et eldre svar kaster ikke et ferskere', async () => {
    let answerOld: (found: SimilarCourse[]) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answerOld = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce([BYNESET]);
    const view = await render(<SimilarCoursesPanel query="bynes" onUse={jest.fn()} />);
    await settle();
    await view.rerender(<SimilarCoursesPanel query="byneset" onUse={jest.fn()} />);
    await settle();
    expect(screen.getByTestId('similar-course-c1')).toBeTruthy();

    await act(async () => {
      answerOld([{ ...BYNESET, id: 'old', name: 'Gammelt svar' }]);
    });
    expect(screen.queryByTestId('similar-course-old')).toBeNull();
    expect(screen.getByTestId('similar-course-c1')).toBeTruthy();
  });

  it('«Nei» skjuler lista mens navnet starter likt, og et annet navn åpner den igjen', async () => {
    fetchMock.mockResolvedValue([BYNESET]);
    const view = await render(<SimilarCoursesPanel query="byneset" onUse={jest.fn()} />);
    await settle();
    await fireEvent.press(screen.getByTestId('similar-courses-add-anyway'));
    expect(screen.queryByTestId('similar-courses')).toBeNull();

    await view.rerender(<SimilarCoursesPanel query="byneset gk" onUse={jest.fn()} />);
    await settle();
    expect(screen.queryByTestId('similar-courses')).toBeNull();

    await view.rerender(<SimilarCoursesPanel query="losby" onUse={jest.fn()} />);
    await settle();
    expect(screen.getByTestId('similar-courses')).toBeTruthy();
  });

  it('under tre tegn igjen går det gamle svaret', async () => {
    fetchMock.mockResolvedValue([BYNESET]);
    const view = await render(<SimilarCoursesPanel query="byneset" onUse={jest.fn()} />);
    await settle();
    await view.rerender(<SimilarCoursesPanel query="by" onUse={jest.fn()} />);
    expect(screen.queryByTestId('similar-courses')).toBeNull();
  });
});
