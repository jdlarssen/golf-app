// native/app/src/lib/webLink.test.ts
// Native #1891: adressen til webben, og de to måtene den kan svikte på.
//
// Env-fella er hele grunnen til at fila finnes. `EXPO_PUBLIC_WEB_BASE_URL`
// bakes inn ved bundling, og et bygg uten den ville gitt lenke-knapper som
// gjør ingenting — den stille no-op-en ærlig-feil-guardrailen forbyr. Testen
// låser at mangelen blir en TYPET kode (som skjermen kan vise), ikke en URL
// som begynner med «undefined».
//
// Sti-sammensettingen er den andre: kallstedene skriver stier både med og uten
// ledende skråstrek, og basen kan ha en trailing slash i et bygg. `//games/1`
// er en annen adresse enn `/games/1`, og en 404 der ville sett ut som at
// nettsiden mangler siden.
import { Linking } from 'react-native';
import { openWeb, webBaseUrl, webUrl } from './webLink';

const BASE_URL = 'https://staging.example';

describe('webLink', () => {
  // `Linking.openURL` er ALT en jest-mock — jest-expo-preseten bytter ut
  // native-delene av SDK-en før suiten kjører. `jest.restoreAllMocks()` setter
  // den derfor tilbake til preset-mocken, ikke til noe ekte, og kall-loggen
  // følger med inn i neste test (verifisert: `isMockFunction` er fortsatt true
  // etter restore). Spionen tas derfor her, med en eksplisitt nullstilling.
  let openURL: jest.SpyInstance<Promise<boolean>, [string]>;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE_URL;
    openURL = jest.spyOn(Linking, 'openURL');
    openURL.mockReset();
    openURL.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  describe('webUrl', () => {
    it('setter sammen base og sti', () => {
      expect(webUrl('/games/game-1/submit')).toEqual({
        ok: true,
        url: `${BASE_URL}/games/game-1/submit`,
      });
    });

    it('godtar en sti uten ledende skråstrek', () => {
      expect(webUrl('opprett-spill')).toEqual({
        ok: true,
        url: `${BASE_URL}/opprett-spill`,
      });
    });

    it('lager aldri dobbel skråstrek, uansett hvordan de to endene ser ut', () => {
      process.env.EXPO_PUBLIC_WEB_BASE_URL = `${BASE_URL}/`;

      expect(webUrl('/cup/cup-1')).toEqual({
        ok: true,
        url: `${BASE_URL}/cup/cup-1`,
      });
    });

    it('svarer typet når bygget mangler adressen', () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(webUrl('/games/game-1')).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
    });

    it('leser en blank env-verdi som ingen verdi', () => {
      // Et bygg med `EXPO_PUBLIC_WEB_BASE_URL=` gir en tom streng, ikke
      // undefined — og «https://» + sti er ingen adresse.
      process.env.EXPO_PUBLIC_WEB_BASE_URL = '   ';

      expect(webBaseUrl()).toBeNull();
      expect(webUrl('/games/game-1')).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
    });
  });

  describe('openWeb', () => {
    it('åpner den sammensatte adressen', async () => {
      expect(await openWeb('/games/game-1/spillere')).toEqual({ ok: true });
      expect(openURL).toHaveBeenCalledWith(`${BASE_URL}/games/game-1/spillere`);
    });

    it('kaster ikke når nettleseren ikke lot seg åpne', async () => {
      // `openURL` avviser når iOS ikke finner noen som vil ta URL-en. Et kast
      // her ville tatt skjermen; en typet kode blir til en setning.
      openURL.mockRejectedValue(new Error('no handler'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(await openWeb('/games/game-1')).toEqual({
        ok: false,
        reason: 'open-failed',
      });
    });

    it('åpner ingenting når bygget mangler adressen', async () => {
      delete process.env.EXPO_PUBLIC_WEB_BASE_URL;

      expect(await openWeb('/games/game-1')).toEqual({
        ok: false,
        reason: 'no-web-base-url',
      });
      expect(openURL).not.toHaveBeenCalled();
    });
  });
});
