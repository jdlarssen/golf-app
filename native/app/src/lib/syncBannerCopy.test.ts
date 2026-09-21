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

describe('SYNC_BANNER_TEXT', () => {
  it('bruker webbens tekster tegn for tegn', () => {
    expect(SYNC_BANNER_TEXT.quarantineHoles).toBe(WEB.quarantineHoles);
    expect(SYNC_BANNER_TEXT.abandonedMessage).toBe(WEB.abandonedMessage);
    expect(SYNC_BANNER_TEXT.quarantineRecoveryHint).toBe(WEB.quarantineRecoveryHint);
    expect(SYNC_BANNER_TEXT.quarantineDetailsTitle).toBe(WEB.quarantineDetailsTitle);
    expect(SYNC_BANNER_TEXT.quarantineDismiss).toBe(WEB.quarantineDismiss);
    expect(SYNC_BANNER_TEXT.quarantineDismissConfirm).toBe(WEB.quarantineDismissConfirm);
    expect(SYNC_BANNER_TEXT.retry).toBe(WEB.retry);
    expect(SYNC_BANNER_TEXT.retrying).toBe(WEB.retrying);
    expect(SYNC_BANNER_TEXT.conflictNotice).toBe(WEB.conflictNotice);
    expect(SYNC_BANNER_TEXT.conflictNoticeMarker).toBe(WEB.conflictNoticeMarker);
    expect(SYNC_BANNER_TEXT.conflictDismiss).toBe(WEB.conflictDismiss);
  });

  it('har begge flertallsgrenene fra webbens ICU-tekst', () => {
    expect(WEB.quarantineOtherGame).toContain(
      `one {${SYNC_BANNER_TEXT.quarantineOtherGameOne}}`,
    );
    expect(WEB.quarantineOtherGame).toContain(
      `other {${SYNC_BANNER_TEXT.quarantineOtherGameOther}}`,
    );
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
