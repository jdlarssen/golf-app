// native/app/src/lib/stagingGate.test.ts
// Native #1906: gaten som avgjør om Sync-lab-raden finnes i profil-rommet.
//
// Testen har én jobb: bevise at gaten er FAIL-CLOSED. Alt annet enn et bygg
// som beviselig peker på staging-basen skal svare nei — også de tilfellene der
// verten «ser riktig ut». Det er nettopp der en `includes()`-sjekk ville sagt
// ja, og et prod-bygg ville fått utviklerverktøy i menyen.
//
// `process.env` settes per case og ryddes etterpå: env-varen bakes inn ved
// bundling på enheten, men i node er den delt tilstand mellom testfiler.
import { STAGING_SUPABASE_HOST, isStagingBuild } from './stagingGate';

const STAGING_URL = `https://${STAGING_SUPABASE_HOST}`;

describe('isStagingBuild', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  });

  it.each([
    ['staging-basen', STAGING_URL, true],
    ['staging-basen med etterfølgende skråstrek', `${STAGING_URL}/`, true],
    ['staging-basen med sti', `${STAGING_URL}/rest/v1`, true],
    ['staging-basen med eksplisitt port', `${STAGING_URL}:443`, true],
    ['staging-verten skrevet med store bokstaver', STAGING_URL.toUpperCase(), true],
    ['et annet Supabase-prosjekt', 'https://etannetprosjekt.supabase.co', false],
    ['tom streng', '', false],
    ['bare mellomrom', '   ', false],
    ['søppel', 'ikke-en-url', false],
    ['en adresse uten skjema', `${STAGING_SUPABASE_HOST}`, false],
  ])('svarer %s → %s', (_label, value, expected) => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = value as string;
    expect(isStagingBuild()).toBe(expected);
  });

  it('svarer nei når bygget ikke har env-varen i det hele tatt', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(isStagingBuild()).toBe(false);
  });

  // Hele grunnen til at verten parses i stedet for å søkes etter. Begge disse
  // inneholder staging-verten som delstreng, og ingen av dem ER staging.
  it.each([
    ['staging-verten som prefiks i et annet domene', `https://${STAGING_SUPABASE_HOST}.angriper.no`],
    ['staging-verten som brukerinfo foran en annen vert', `https://${STAGING_SUPABASE_HOST}@angriper.no`],
    ['staging-verten bare i stien', `https://angriper.no/${STAGING_SUPABASE_HOST}`],
  ])('svarer nei på %s', (_label, value) => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = value;
    expect(isStagingBuild()).toBe(false);
  });

  it('kaster aldri — en gate som kaster under render tar ned skjermen', () => {
    for (const value of ['', 'http://', '://', 'https://:8080', '%%%']) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = value;
      expect(() => isStagingBuild()).not.toThrow();
    }
  });
});
