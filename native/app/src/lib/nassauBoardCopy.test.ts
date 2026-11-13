// #2755 (Type A): Nassau-tavlas tekster er webbens, tegn for tegn. De rene
// strengene sammenlignes med `messages/no.json`; hver ICU-mal låses til kilden,
// og funksjonene som fyller dem ut, gir teksten next-intl ville gitt i hver gren.
import source from '../../../../messages/no.json';
import {
  NASSAU_BOARD_TEXT,
  NASSAU_CARD_KICKER,
  NASSAU_ICU_SOURCE,
  NASSAU_KICKER_SOURCE,
  NASSAU_TEXT,
  nassauBoardCopy,
} from './nassauBoardCopy';

const nassau = source.leaderboard.nassau;
const board = nassau.board;

describe('paritet med messages/no.json', () => {
  it.each(Object.entries(NASSAU_BOARD_TEXT))('leaderboard.nassau.board.%s er identisk med kilden', (key, value) => {
    expect((board as Record<string, string>)[key]).toBe(value);
  });

  it.each(Object.entries(NASSAU_TEXT))('leaderboard.nassau.%s er identisk med kilden', (key, value) => {
    expect((nassau as Record<string, unknown>)[key]).toBe(value);
  });

  it.each(Object.entries(NASSAU_ICU_SOURCE))('malen %s står som i kilden', (key, value) => {
    expect((board as Record<string, string>)[key]).toBe(value);
  });

  it('kickeren er kildens uten spillnavnet', () => {
    expect(board.kicker).toBe(NASSAU_KICKER_SOURCE);
    expect(NASSAU_KICKER_SOURCE.replace('{game} · ', '')).toContain('Nassau · ');
  });

  it('kortenes kickere er overskriftene i kilden', () => {
    expect(NASSAU_CARD_KICKER).toEqual({
      front9: nassau.front9Heading,
      back9: nassau.back9Heading,
      total18: nassau.totalLabel,
    });
  });
});

describe('ICU-malene fylt ut for hånd', () => {
  it('stateLive', () => {
    expect(nassauBoardCopy.stateLive(4, 9)).toBe('4 av 9 hull');
  });

  it('viewerRank og viewerSr, med og uten delt plass', () => {
    expect(nassauBoardCopy.viewerRank(false, 2)).toBe('Du: 2.');
    expect(nassauBoardCopy.viewerRank(true, 2)).toBe('Du: delt 2.');
    expect(nassauBoardCopy.viewerSr(false, 2)).toBe('Du er nummer 2');
    expect(nassauBoardCopy.viewerSr(true, 2)).toBe('Du er delt nummer 2');
  });

  it('viewerRankGap og viewerSrGap, med og uten delt plass', () => {
    expect(nassauBoardCopy.viewerRankGap(false, 3, 4)).toBe('Du: 3. · 4 bak');
    expect(nassauBoardCopy.viewerRankGap(true, 3, 4)).toBe('Du: delt 3. · 4 bak');
    expect(nassauBoardCopy.viewerSrGap(false, 3, 4)).toBe('Du er nummer 3, 4 slag bak');
    expect(nassauBoardCopy.viewerSrGap(true, 3, 4)).toBe('Du er delt nummer 3, 4 slag bak');
  });

  it('viewerLeadBy og sweepOther', () => {
    expect(nassauBoardCopy.viewerLeadBy(2)).toBe('Du leder med 2');
    expect(nassauBoardCopy.sweepOther('Ola')).toBe('Ola kan ta alle tre.');
  });

  it('stopSweep, panelHeading i alle grener', () => {
    expect(nassauBoardCopy.stopSweep('front9')).toBe('Du kan stoppe det på front 9.');
    expect(nassauBoardCopy.stopSweep('back9')).toBe('Du kan stoppe det på back 9.');
    expect(nassauBoardCopy.stopSweep('total18')).toBe('Du kan stoppe det på totalen.');
    expect(nassauBoardCopy.panelHeading('front9')).toBe('Front 9 · hull 1–9');
    expect(nassauBoardCopy.panelHeading('back9')).toBe('Back 9 · hull 10–18');
    expect(nassauBoardCopy.panelHeading('total18')).toBe('Totalt · hull 1–18');
  });

  it('listUnit, rowHoles og kicker', () => {
    expect(nassauBoardCopy.listUnit('toPar')).toBe('mot par');
    expect(nassauBoardCopy.listUnit('gross')).toBe('brutto slag');
    expect(nassauBoardCopy.listUnit('net')).toBe('netto slag');
    expect(nassauBoardCopy.rowHoles(7)).toBe('7 hull');
    expect(nassauBoardCopy.kicker('net')).toBe('Nassau · netto');
    expect(nassauBoardCopy.kicker('gross')).toBe('Nassau · brutto');
  });
});
