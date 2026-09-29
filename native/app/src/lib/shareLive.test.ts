// #2255: Del-knappen deler webbens «følg live»-lenke med telefonens delingsark.
import { Platform, Share } from 'react-native';
import { liveFollowPath, shareLiveFollow } from './shareLive';

const ENV = process.env.EXPO_PUBLIC_WEB_BASE_URL;
afterEach(() => {
  process.env.EXPO_PUBLIC_WEB_BASE_URL = ENV;
  jest.restoreAllMocks();
});

it('stien er webbens: /no/spectate/<token>', () => {
  expect(liveFollowPath('abc-123')).toBe('/no/spectate/abc-123');
});

it('iOS: tekst og lenke hver for seg; Android: lenka i teksten', async () => {
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://tornygolf.no';
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  jest.replaceProperty(Platform, 'OS', 'ios');
  await expect(shareLiveFollow('abc')).resolves.toEqual({ ok: true });
  expect(share).toHaveBeenLastCalledWith({
    message: 'Følg turneringen live i Tørny',
    url: 'https://tornygolf.no/no/spectate/abc',
  });
  jest.replaceProperty(Platform, 'OS', 'android');
  await shareLiveFollow('abc');
  expect(share).toHaveBeenLastCalledWith({
    message: 'Følg turneringen live i Tørny https://tornygolf.no/no/spectate/abc',
  });
});

it('uten webadresse i bygget, eller når arket feiler: et svar, ikke et kast', async () => {
  process.env.EXPO_PUBLIC_WEB_BASE_URL = '';
  await expect(shareLiveFollow('abc')).resolves.toEqual({ ok: false, reason: 'no-web-base-url' });
  process.env.EXPO_PUBLIC_WEB_BASE_URL = 'https://tornygolf.no';
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('nei'));
  await expect(shareLiveFollow('abc')).resolves.toEqual({ ok: false, reason: 'failed' });
});
