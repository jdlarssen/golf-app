// #2255: «Legg til i kalender» ber om tilgang bare der arket krever det, og
// et nei eller en feil blir et rolig svar, aldri et kast.
import { Platform } from 'react-native';
import { addToCalendar, needsPermissionFirst } from './addToCalendar';

const mockCalendar = {
  requestCalendarPermissionsAsync: jest.fn(),
  createEventInCalendarAsync: jest.fn(),
};
jest.mock('expo-calendar/legacy', () => mockCalendar);

const EVENT = {
  title: 'Klubbmesterskap',
  location: 'Losby',
  startDate: '2026-10-03T07:30:00.000Z',
  endDate: '2026-10-03T12:00:00.000Z',
  notes: 'Tee: Gul · Stableford',
};

function onIos(version: string) {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockCalendar.requestCalendarPermissionsAsync.mockReset();
  mockCalendar.createEventInCalendarAsync.mockReset().mockResolvedValue({ action: 'saved' });
});

describe('needsPermissionFirst', () => {
  it.each([
    ['ios', '16.7', true],
    ['ios', '17.0', false],
    ['ios', '26.5', false],
    ['android', 34, false],
    ['ios', 'ukjent', false],
  ])('%s %s → %s', (os, version, expected) => {
    expect(needsPermissionFirst(os, version)).toBe(expected);
  });
});

describe('addToCalendar', () => {
  it('iOS 17+: åpner arket med hendelsen, uten å spørre om tilgang', async () => {
    onIos('17.4');
    await expect(addToCalendar(EVENT)).resolves.toEqual({ ok: true });
    expect(mockCalendar.requestCalendarPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCalendar.createEventInCalendarAsync).toHaveBeenCalledWith(EVENT);
  });

  it('iOS før 17: spør først, og et nei åpner ikke arket', async () => {
    onIos('16.7');
    mockCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(addToCalendar(EVENT)).resolves.toEqual({ ok: false, reason: 'denied' });
    expect(mockCalendar.createEventInCalendarAsync).not.toHaveBeenCalled();
  });

  it('iOS før 17 med ja: arket åpnes', async () => {
    onIos('16.7');
    mockCalendar.requestCalendarPermissionsAsync.mockResolvedValue({ granted: true });
    await expect(addToCalendar(EVENT)).resolves.toEqual({ ok: true });
    expect(mockCalendar.createEventInCalendarAsync).toHaveBeenCalledTimes(1);
  });

  it('en feil fra modulen (f.eks. et gammelt app-bygg uten den) blir «failed», ikke et kast', async () => {
    onIos('26.5');
    mockCalendar.createEventInCalendarAsync.mockRejectedValue(new Error('Cannot find native module'));
    await expect(addToCalendar(EVENT)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
});
