// #2255: «Hull for hull» i appen bruker webbens ord.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import { HOLES_TEXT, grossChip, holeNumberLabel, holesPlayedChip, parSiChip } from './holesCopy';

const common = source.leaderboard.common;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

describe('paritet mot messages/no.json', () => {
  it('overskrifter, stillingen og nienes navn', () => {
    expect(HOLES_TEXT.heading).toBe(common.hullForHullHeading);
    expect(HOLES_TEXT.heading).toBe(source.game.home.hullForHull);
    expect(HOLES_TEXT.standings).toBe(common.stillingen);
    expect(HOLES_TEXT.frontHeading).toBe(common.nineHeadingFront);
    expect(HOLES_TEXT.frontSub).toBe(common.nineSubFront);
    expect(HOLES_TEXT.backHeading).toBe(common.nineHeadingBack);
    expect(HOLES_TEXT.backSub).toBe(common.nineSubBack);
    expect(HOLES_TEXT.strokeplaySubtitle).toBe(source.leaderboard.soloStrokeplay.hullForHullSubtitle);
  });

  it('reveal, venter og ukjent spiller', () => {
    expect(HOLES_TEXT.waiting).toBe(common.venter);
    expect(HOLES_TEXT.revealHiddenTitle).toBe(common.revealHiddenTitle);
    expect(HOLES_TEXT.revealHiddenSub).toBe(common.hullForHullRevealSub);
    expect(HOLES_TEXT.goodLuck).toBe(common.goodLuck);
    expect(HOLES_TEXT.unknownPlayerFull).toBe(common.unknownPlayerFull);
    expect(HOLES_TEXT.unknownPlayer).toBe(common.unknownPlayer);
  });

  it('chippene med tall', () => {
    expect(holesPlayedChip(7)).toBe(fill(common.hullChip, { count: 7 }));
    expect(grossChip(82)).toBe(fill(common.grossBrutto, { count: 82 }));
    expect(holeNumberLabel(4)).toBe(fill(common.hullNumber, { number: 4 }));
    expect(parSiChip(4, 7)).toBe(fill(common.parSiChip, { par: 4, si: 7 }));
  });
});

it('ingen tekst står tom eller med en plassholder ingen fylte inn', () => {
  for (const text of Object.values(HOLES_TEXT)) {
    expect(isFinishedSentence(text)).toBe(true);
  }
});
