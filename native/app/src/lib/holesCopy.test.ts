// #2255: «Hull for hull» i appen bruker webbens ord.
import source from '../../../../messages/no.json';
import { isFinishedSentence } from '../test/copy';
import {
  HOLES_TEXT,
  WOLF_HOLES_TEXT,
  grossChip,
  holeNumberLabel,
  holesPlayedChip,
  parSiChip,
  wolfBruttoLabel,
  wolfChoicePartner,
  wolfSubtitle,
} from './holesCopy';

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
    expect(HOLES_TEXT.wellPlayed).toBe(common.wellPlayed);
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

describe('Wolf (#2255 PR 3b): paritet mot messages/no.json', () => {
  const wolf = source.leaderboard.wolf;
  it('etiketter, valg, utfall og sider', () => {
    expect(WOLF_HOLES_TEXT.wolfLabel).toBe(wolf.wolfLabel);
    expect(WOLF_HOLES_TEXT.choiceLone).toBe(wolf.choiceLone);
    expect(WOLF_HOLES_TEXT.choiceBlind).toBe(wolf.choiceBlind);
    expect(WOLF_HOLES_TEXT.choiceWaiting).toBe(wolf.choiceWaiting);
    expect(WOLF_HOLES_TEXT.outcomeWolfVant).toBe(wolf.outcomeWolfVant);
    expect(WOLF_HOLES_TEXT.outcomeAndreVant).toBe(wolf.outcomeAndreVant);
    expect(WOLF_HOLES_TEXT.outcomeLik).toBe(wolf.outcomeLik);
    expect(WOLF_HOLES_TEXT.outcomeVenter).toBe(wolf.outcomeVenter);
    expect(WOLF_HOLES_TEXT.wolfSide).toBe(wolf.wolfSide);
    expect(WOLF_HOLES_TEXT.andreSide).toBe(wolf.andreSide);
    expect(WOLF_HOLES_TEXT.netto).toBe(common.netto);
    expect(WOLF_HOLES_TEXT.brutto).toBe(common.brutto);
    expect(HOLES_TEXT.revealHiddenSub).toBe(wolf.hullForHullRevealSub);
  });

  it('tekstene med tall og navn', () => {
    expect(wolfChoicePartner('Ola')).toBe(fill(wolf.choicePartner, { partnerName: 'Ola' }));
    expect(wolfBruttoLabel(5)).toBe(fill(wolf.bruttoLabel, { count: 5 }));
    expect(wolfSubtitle('net')).toBe(`Wolf · ${common.netto}`);
    expect(wolfSubtitle('gross')).toBe(`Wolf · ${common.brutto}`);
  });
});

it('ingen tekst står tom eller med en plassholder ingen fylte inn', () => {
  for (const text of [...Object.values(HOLES_TEXT), ...Object.values(WOLF_HOLES_TEXT)]) {
    expect(isFinishedSentence(text)).toBe(true);
  }
});
