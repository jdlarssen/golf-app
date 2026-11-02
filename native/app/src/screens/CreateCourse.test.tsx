// native/app/src/screens/CreateCourse.test.tsx
// #2757: «Ny bane» (Type C). Reglene er testet i `courseDraft.test.ts`, RPC-en i
// `createCourse.test.ts`. Her er koblingen: knappen følger utkastet, feil blir
// stående med tastet innhold, og lagret bane går tilbake med `backTo`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-factories heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createCourse } from '../data/createCourse';
import { fetchSimilarCourses } from '../data/similarCourses';
import { isDeviceOnline } from '../data/syncTriggers';
import type { ScreenProps } from '../navigation';
import { stackNavigation } from '../test/stackNavigation';
import { CreateCourse } from './CreateCourse';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('react-native-safe-area-context', () => require('../test/safeAreaMock').safeAreaMock());
jest.mock('../data/syncTriggers', () => ({ isDeviceOnline: jest.fn(() => true) }));
jest.mock('../data/createCourse', () => ({ createCourse: jest.fn() }));
jest.mock('../data/similarCourses', () => ({ fetchSimilarCourses: jest.fn(async () => []) }));

const saveMock = createCourse as jest.Mock;
const onlineMock = isDeviceOnline as jest.Mock;
const similarMock = fetchSimilarCourses as jest.Mock;

function renderScreen(name?: string) {
  const navigation = stackNavigation([{ name: 'Home' }, { name: 'CreateGame' }, { name: 'CreateCourse' }]);
  const view = render(
    <CreateCourse
      navigation={navigation as unknown as ScreenProps<'CreateCourse'>['navigation']}
      route={{ key: 'CreateCourse-1', name: 'CreateCourse', params: { name } }}
    />,
  );
  return { navigation, view };
}

async function fillValidCourse() {
  await fireEvent.changeText(screen.getByTestId('course-name'), 'Testbane 2757');
  for (let hole = 1; hole <= 18; hole++) {
    await fireEvent.changeText(screen.getByTestId(`course-index-1-${hole}`), String(hole));
  }
  await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
  await fireEvent.changeText(screen.getByTestId('tee-0-slope-mens'), '125');
  await fireEvent.changeText(screen.getByTestId('tee-0-cr-mens'), '70,5');
}

const status = () => screen.getByTestId('course-save-status').props.children;
const saveDisabled = () => screen.getByTestId('course-save').props.accessibilityState.disabled;

beforeEach(() => {
  saveMock.mockReset();
  onlineMock.mockReturnValue(true);
  similarMock.mockClear();
});

describe('CreateCourse', () => {
  it('åpner med det du søkte på som navn', async () => {
    const { view } = renderScreen('Testbane 2757');
    await view;
    expect(screen.getByTestId('course-name').props.value).toBe('Testbane 2757');
    expect(status()).toBe('Mangler 18 indekser');
    expect(saveDisabled()).toBe(true);
  });

  it('linja viser første feil, og knappen er aktiv først når parseren godtar utkastet', async () => {
    const { view } = renderScreen('');
    await view;
    expect(status()).toBe('Banen må ha et navn.');

    await fireEvent.changeText(screen.getByTestId('course-name'), 'Testbane 2757');
    await fireEvent.changeText(screen.getByTestId('course-index-1-1'), '7');
    await fireEvent.changeText(screen.getByTestId('course-index-1-2'), '7');
    expect(status()).toBe('Indeks 7 er brukt mer enn én gang');

    await fireEvent.changeText(screen.getByTestId('course-index-1-2'), '2');
    await fireEvent.changeText(screen.getByTestId('course-index-1-1'), '1');
    for (let hole = 3; hole <= 18; hole++) {
      await fireEvent.changeText(screen.getByTestId(`course-index-1-${hole}`), String(hole));
    }
    expect(status()).toBe('Velg minst én tee');

    await fireEvent.press(screen.getByTestId('tee-chip-yellow'));
    expect(status()).toBe('Gul mangler slope og CR');
    await fireEvent.changeText(screen.getByTestId('tee-0-slope-mens'), '125');
    expect(status()).toBe('Gul trenger både slope og CR');
    await fireEvent.changeText(screen.getByTestId('tee-0-cr-mens'), '70,5');
    expect(screen.queryByTestId('course-save-status')).toBeNull();
    expect(saveDisabled()).toBe(false);

    await fireEvent.changeText(screen.getByTestId('tee-0-length'), '999');
    expect(status()).toBe('Lengden på Gul må være et helt tall fra 1\u00a0000 til 12\u00a0000 meter');
    expect(saveDisabled()).toBe(true);
  });

  it('lagret bane går tilbake til veiviseren med id-en', async () => {
    saveMock.mockResolvedValueOnce({ ok: true, courseId: 'new-course' });
    const { navigation, view } = renderScreen();
    await view;
    await fillValidCourse();
    await fireEvent.press(screen.getByTestId('course-save'));

    expect(saveMock).toHaveBeenCalledTimes(1);
    const parsed = saveMock.mock.calls[0]![0];
    expect(parsed.name).toBe('Testbane 2757');
    expect(parsed.holes).toHaveLength(18);
    expect(parsed.teeBoxes[0].course_rating_mens).toBe(70.5);
    expect(navigation.popTo).toHaveBeenCalledWith('CreateGame', { createdCourseId: 'new-course' });
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('«Bruk denne» går samme vei med den eksisterende banen', async () => {
    similarMock.mockResolvedValue([
      { id: 'byneset', name: 'Byneset Golfklubb', holeCount: 18, par: 72, teeCount: 2, roundCount: 41 },
    ]);
    jest.useFakeTimers();
    const { navigation, view } = renderScreen('byneset');
    await view;
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    await fireEvent.press(screen.getByTestId('similar-course-byneset'));
    expect(navigation.popTo).toHaveBeenCalledWith('CreateGame', { createdCourseId: 'byneset' });
    expect(saveMock).not.toHaveBeenCalled();
    similarMock.mockResolvedValue([]);
  });

  it('uten nett sier skjermen fra, sender ingenting og beholder det du har tastet', async () => {
    onlineMock.mockReturnValue(false);
    const { navigation, view } = renderScreen();
    await view;
    await fillValidCourse();
    await fireEvent.press(screen.getByTestId('course-save'));

    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('course-save-error').props.children).toBe(
      'Fikk ikke kontakt. Sjekk nettet og prøv igjen.',
    );
    expect(navigation.popTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('course-index-1-18').props.value).toBe('18');
  });

  it.each([
    ['network', 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.'],
    ['db', 'Noe gikk galt under lagring. Prøv igjen.'],
    ['no_row', 'Noe gikk galt under lagring. Prøv igjen.'],
  ])('en feilet lagring (%s) låser opp knappen igjen', async (code, text) => {
    saveMock.mockResolvedValueOnce({ ok: false, code });
    const { navigation, view } = renderScreen();
    await view;
    await fillValidCourse();
    await fireEvent.press(screen.getByTestId('course-save'));

    expect(screen.getByTestId('course-save-error').props.children).toBe(text);
    expect(saveDisabled()).toBe(false);
    expect(navigation.popTo).not.toHaveBeenCalled();
  });

  it('dobbelttrykk lagrer én gang, og knappen sier «Lagrer …» imens', async () => {
    let finish: (value: unknown) => void = () => undefined;
    saveMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { view } = renderScreen();
    await view;
    await fillValidCourse();
    await fireEvent.press(screen.getByTestId('course-save'));
    await fireEvent.press(screen.getByTestId('course-save'));

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Lagrer …')).toBeTruthy();
    await act(async () => {
      finish({ ok: true, courseId: 'new-course' });
    });
  });
});
