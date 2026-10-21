// native/app/src/lib/appBuild.test.ts
// Native #2619: byggnummeret og versjons-headerne. Ukjent er `null` / utelatt,
// aldri et gjettet tall eller strengen «undefined».
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appVersionHeaders, parseBuild, readAppBuild } from './appBuild';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: undefined } }));

const constants = Constants as unknown as { expoConfig: unknown };
const platform = Platform as unknown as { OS: string };

afterEach(() => {
  constants.expoConfig = undefined;
});

describe('parseBuild', () => {
  it.each([
    ['5', 5],
    [' 12 ', 12],
    [7, 7],
    ['0', null],
    [0, null],
    ['1.2', null],
    ['abc', null],
    [-3, null],
    [undefined, null],
    [null, null],
  ])('%p -> %p', (raw, expected) => {
    expect(parseBuild(raw)).toBe(expected);
  });
});

describe('readAppBuild og appVersionHeaders', () => {
  const config = { version: '1.2.0', ios: { buildNumber: '5' }, android: { versionCode: 6 } };

  it('leser iOS-bygget', () => {
    platform.OS = 'ios';
    constants.expoConfig = config;
    expect(readAppBuild()).toEqual({ platform: 'ios', version: '1.2.0', build: 5 });
    expect(appVersionHeaders()).toEqual({
      'X-Torny-App-Version': '1.2.0',
      'X-Torny-App-Build': '5',
    });
  });

  it('leser Android-versionCode', () => {
    platform.OS = 'android';
    constants.expoConfig = config;
    expect(readAppBuild()).toEqual({ platform: 'android', version: '1.2.0', build: 6 });
  });

  it('utelater det som er ukjent', () => {
    platform.OS = 'ios';
    constants.expoConfig = { version: '1.0.0' };
    expect(appVersionHeaders()).toEqual({ 'X-Torny-App-Version': '1.0.0' });
    constants.expoConfig = undefined;
    expect(appVersionHeaders()).toEqual({});
  });

  it('kjenner ikke andre plattformer', () => {
    platform.OS = 'web';
    constants.expoConfig = config;
    expect(readAppBuild().platform).toBeNull();
    expect(readAppBuild().build).toBeNull();
  });
});
