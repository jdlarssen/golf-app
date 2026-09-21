// native/app/src/lib/syncBannerCopy.test.ts
// Native #1980: paritetsport mot webben. Rettes en SyncBanner-tekst i
// `messages/no.json` uten at appen følger etter, blir denne rød.
import source from '../../../../messages/no.json';
import {
  SYNC_BANNER_TEXT,
  conflictText,
  formatHoleList,
  quarantineHolesText,
  quarantineOtherGameText,
} from './syncBannerCopy';

const WEB = source.SyncBanner;

type WebKey = keyof typeof WEB;

// Regnskapet (#1904-mønsteret): hver app-tekst peker på webbens nøkkel, eller
// på en ICU-nøkkel der appen bærer grenene hver for seg.
const TEXT_MAP = {
  quarantineHoles: 'quarantineHoles',
  quarantineOtherGameOne: 'quarantineOtherGame',
  quarantineOtherGameOther: 'quarantineOtherGame',
  abandonedMessage: 'abandonedMessage',
  quarantineRecoveryHint: 'quarantineRecoveryHint',
  quarantineDetailsTitle: 'quarantineDetailsTitle',
  quarantineDismiss: 'quarantineDismiss',
  quarantineDismissConfirm: 'quarantineDismissConfirm',
  retry: 'retry',
  retrying: 'retrying',
  conflictNotice: 'conflictNotice',
  conflictNoticeMarker: 'conflictNoticeMarker',
  conflictDismiss: 'conflictDismiss',
} as const satisfies Record<keyof typeof SYNC_BANNER_TEXT, WebKey>;

/** ICU-flertall: appens tekst er én gren av webbens melding. */
const PLURAL_BRANCH: Partial<Record<keyof typeof SYNC_BANNER_TEXT, 'one' | 'other'>> = {
  quarantineOtherGameOne: 'one',
  quarantineOtherGameOther: 'other',
};

/** Nøkler under `SyncBanner` appen med vilje IKKE viser, med grunnen. */
const WEB_ONLY: Partial<Record<WebKey, string>> = {
  errorNetwork: 'aktiv-kø-varianten (slag som fortsatt prøver) er ikke med i appen (#1980 del 1)',
  errorAuth: 'aktiv-kø-varianten',
  errorPermission: 'aktiv-kø-varianten',
  errorRateLimit: 'aktiv-kø-varianten',
  errorGeneric: 'aktiv-kø-varianten',
  errorWithQueue: 'aktiv-kø-varianten',
  queueWaiting: 'aktiv-kø-varianten',
  loginAction: 'aktiv-kø-varianten; appen logger inn på sin egen skjerm',
  quarantineGlobalGame: 'den globale varianten; appens banner er alltid knyttet til ett spill',
  quarantineOpenHole: 'lenker til hullene; appen navngir hullene uten lenke',
  quarantineOpenGame: 'lenke til en annen runde; appen navngir den uten lenke',
  ownerWipeFailed: 'speilet i ownerGateCopy.ts (eier-porten)',
};

const MIRRORED = Object.entries(TEXT_MAP) as [keyof typeof SYNC_BANNER_TEXT, WebKey][];

describe('paritet med SyncBanner i messages/no.json', () => {
  it.each(MIRRORED)('%s er webbens «%s» tegn for tegn', (appKey, webKey) => {
    const branch = PLURAL_BRANCH[appKey];
    if (branch) {
      expect(WEB[webKey]).toContain(`${branch} {${SYNC_BANNER_TEXT[appKey]}}`);
    } else {
      expect(SYNC_BANNER_TEXT[appKey]).toBe(WEB[webKey]);
    }
  });

  it('hver nøkkel under SyncBanner er speilet eller står på WEB_ONLY', () => {
    const accounted = new Set<string>([
      ...Object.values(TEXT_MAP),
      ...Object.keys(WEB_ONLY),
    ]);
    expect(Object.keys(WEB).sort()).toEqual([...accounted].sort());
  });
});

describe('utfylling', () => {
  it('lister hullene som webbens norske liste', () => {
    expect(formatHoleList([3])).toBe('3');
    expect(formatHoleList([3, 7])).toBe('3 og 7');
    expect(formatHoleList([3, 7, 12])).toBe('3, 7 og 12');
    expect(quarantineHolesText([3, 7])).toBe('Hull 3 og 7 ble ikke lagret.');
  });

  it('bøyer antallet slag fra andre runder', () => {
    expect(quarantineOtherGameText(1)).toBe('Ett slag fra en annen runde ble ikke lagret.');
    expect(quarantineOtherGameText(3)).toBe('3 slag fra en annen runde ble ikke lagret.');
  });

  it('velger markør-varianten bare når konflikten gjaldt en medspillers slag', () => {
    expect(conflictText(7, undefined)).toBe(WEB.conflictNotice.replace('{holeNumber}', '7'));
    expect(conflictText(7, true)).toBe(WEB.conflictNotice.replace('{holeNumber}', '7'));
    expect(conflictText(7, false)).toBe(WEB.conflictNoticeMarker.replace('{holeNumber}', '7'));
  });
});
