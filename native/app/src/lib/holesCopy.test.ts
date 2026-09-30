// #2255: «Hull for hull» i appen bruker webbens ord.
import source from '../../../../messages/no.json';
import { formatNumber } from '../../../../lib/i18n/format';
import { ninesPointsText } from '../../../../lib/leaderboard/ninesHoles';
import { isFinishedSentence } from '../test/copy';
import {
  ACEY_DEUCEY_HOLES_TEXT,
  BINGO_BANGO_BONGO_HOLES_TEXT,
  HOLES_TEXT,
  NINES_HOLES_TEXT,
  ROUND_ROBIN_HOLES_TEXT,
  WOLF_HOLES_TEXT,
  aceyDeuceyBruttoLabel,
  aceyDeuceySubtitle,
  grossChip,
  holeNumberLabel,
  holesPlayedChip,
  ninesBruttoLabel,
  ninesPoints,
  ninesPotLabel,
  ninesSubtitle,
  parSiChip,
  roundRobinBruttoLabel,
  roundRobinSegmentLabel,
  roundRobinSideNames,
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

  it('scoringen i undertittelen', () => {
    expect(HOLES_TEXT.netto).toBe(common.netto);
    expect(HOLES_TEXT.brutto).toBe(common.brutto);
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
    expect(HOLES_TEXT.revealHiddenSub).toBe(wolf.hullForHullRevealSub);
  });

  it('tekstene med tall og navn', () => {
    expect(wolfChoicePartner('Ola')).toBe(fill(wolf.choicePartner, { partnerName: 'Ola' }));
    expect(wolfBruttoLabel(5)).toBe(fill(wolf.bruttoLabel, { count: 5 }));
    expect(wolfSubtitle('net')).toBe(`Wolf · ${common.netto}`);
    expect(wolfSubtitle('gross')).toBe(`Wolf · ${common.brutto}`);
  });
});

describe('Nines (#2255 PR 3c): paritet mot messages/no.json', () => {
  const nines = source.leaderboard.nines;
  it('variantene og venter', () => {
    expect(NINES_HOLES_TEXT.variantNines).toBe(nines.variantNines);
    expect(NINES_HOLES_TEXT.variantSplitSixes).toBe(nines.variantSplitSixes);
    expect(NINES_HOLES_TEXT.ventePaaScore).toBe(nines.ventePaaScore);
  });

  it('tekstene med tall', () => {
    expect(ninesPotLabel(9)).toBe(fill(nines.potLabel, { pot: 9 }));
    expect(ninesBruttoLabel(5)).toBe(fill(nines.bruttoLabel, { gross: 5 }));
    // « · » mellom variant og scoring er hardkodet i webbens visning.
    expect(ninesSubtitle('variantNines', 'netto')).toBe(`${nines.variantNines} · ${common.netto}`);
    expect(ninesSubtitle('variantSplitSixes', 'brutto')).toBe(`${nines.variantSplitSixes} · ${common.brutto}`);
  });

  it('poengene som webben skriver dem, for hver andel potten kan gi', () => {
    // Webben: `ninesPointsText` med `formatNumber(n, 'no', én desimal)`. Appen
    // har ikke ICU (Hermes), så desimalen bygges lokalt. Hver andel en gruppe
    // med lik score kan få, for 1–6 spillere og begge pottene.
    const web = (n: number) =>
      ninesPointsText(n, (x) => formatNumber(x, 'no', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    const shares = new Set<number>();
    for (const pot of [[5, 3, 1], [4, 2, 0]]) {
      for (let players = 1; players <= 6; players++) {
        for (let i = 0; i < players; i++) {
          for (let j = i + 1; j <= players; j++) {
            let sum = 0;
            for (let k = i; k < j; k++) sum += pot[k] ?? 0;
            shares.add(sum / (j - i));
          }
        }
      }
    }
    expect([...shares].some((n) => !Number.isInteger(n))).toBe(true);
    for (const n of shares) expect(ninesPoints(n)).toBe(web(n));
  });
});

describe('Round Robin (#2255 PR 3c): paritet mot messages/no.json', () => {
  const roundRobin = source.leaderboard.roundRobin;
  it('mot, vant hullet, utfallet og hull-spennet', () => {
    expect(ROUND_ROBIN_HOLES_TEXT.vsLabel).toBe(roundRobin.vsLabel);
    expect(ROUND_ROBIN_HOLES_TEXT.vantHulletLabel).toBe(roundRobin.vantHulletLabel);
    expect(ROUND_ROBIN_HOLES_TEXT.outcomeChipTied).toBe(roundRobin.outcomeChipTied);
    expect(ROUND_ROBIN_HOLES_TEXT.outcomeChipVenter).toBe(roundRobin.outcomeChipVenter);
    expect(ROUND_ROBIN_HOLES_TEXT.segmentHoles1).toBe(roundRobin.segmentHoles1);
    expect(ROUND_ROBIN_HOLES_TEXT.segmentHoles2).toBe(roundRobin.segmentHoles2);
    expect(ROUND_ROBIN_HOLES_TEXT.segmentHoles3).toBe(roundRobin.segmentHoles3);
  });

  it('tekstene med tall og navn', () => {
    expect(roundRobinSegmentLabel(2, 'segmentHoles2')).toBe(
      fill(roundRobin.segmentLabel, { number: 2, holes: roundRobin.segmentHoles2 }),
    );
    expect(roundRobinBruttoLabel(5)).toBe(fill(roundRobin.bruttoLabel, { gross: 5 }));
    // « + » mellom partnerne er hardkodet i webbens visning (`sideNames`).
    expect(roundRobinSideNames(['Ola', 'Kari'])).toBe('Ola + Kari');
  });
});

describe('Acey Deucey (#2255 PR 3c): paritet mot messages/no.json', () => {
  const aceyDeucey = source.leaderboard.aceyDeucey;
  it('tekstene med tall, og undertittelen', () => {
    expect(aceyDeuceyBruttoLabel(5)).toBe(fill(aceyDeucey.bruttoLabel, { gross: 5 }));
    // «Acey Deucey · » foran scoringen er hardkodet i webbens visning.
    expect(aceyDeuceySubtitle('netto')).toBe(`Acey Deucey · ${common.netto}`);
    expect(aceyDeuceySubtitle('brutto')).toBe(`Acey Deucey · ${common.brutto}`);
  });
});

describe('Bingo Bango Bongo (#2255 PR 3c): paritet mot messages/no.json', () => {
  const bbb = source.leaderboard.bingoBangoBongo;
  it('undertittelen, hintene, «Feiet!», hull som venter og «ikke satt»', () => {
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.subtitle).toBe(bbb.holesSubtitle);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.firstOnGreen).toBe(bbb.firstOnGreen);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.nearestPin).toBe(bbb.nearestPin);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.firstInHole).toBe(bbb.firstInHole);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.feietChip).toBe(bbb.feietChip);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.ingenPrestasjoner).toBe(bbb.ingenPrestasjoner);
    expect(BINGO_BANGO_BONGO_HOLES_TEXT.ikkeSatt).toBe(bbb.ikkeSatt);
  });

  it('navnene på prestasjonene er hardkodet i webbens visning, ikke i meldingene', () => {
    // Webben skriver «Bingo», «Bango» og «Bongo» rett i JSX-en (`CATEGORY_LABEL`).
    expect([
      BINGO_BANGO_BONGO_HOLES_TEXT.bingo,
      BINGO_BANGO_BONGO_HOLES_TEXT.bango,
      BINGO_BANGO_BONGO_HOLES_TEXT.bongo,
    ]).toEqual(['Bingo', 'Bango', 'Bongo']);
    expect(`${BINGO_BANGO_BONGO_HOLES_TEXT.bingo} ${BINGO_BANGO_BONGO_HOLES_TEXT.bango} ${BINGO_BANGO_BONGO_HOLES_TEXT.bongo}`).toBe(
      bbb.subtitle,
    );
  });
});

it('ingen tekst står tom eller med en plassholder ingen fylte inn', () => {
  for (const text of [
    ...Object.values(HOLES_TEXT),
    ...Object.values(WOLF_HOLES_TEXT),
    ...Object.values(NINES_HOLES_TEXT),
    ...Object.values(ROUND_ROBIN_HOLES_TEXT),
    ...Object.values(ACEY_DEUCEY_HOLES_TEXT),
    ...Object.values(BINGO_BANGO_BONGO_HOLES_TEXT),
  ]) {
    expect(isFinishedSentence(text)).toBe(true);
  }
});
