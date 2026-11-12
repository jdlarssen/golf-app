// #2753 D3: oppsettet for de nye formatene sier det samme som nettet.
import source from '../../../../messages/no.json';
import {
  PATSOME_TEXT,
  SHAMBLE_TEXT,
  TEAM_HANDICAP_TEXT,
  TEAM_SIZE_TEXT,
  sumEquivalentText,
} from './formatSetupCopy';

const patsome = source.wizard.sections.patsome;

describe('Patsome-oppsettet er nettets', () => {
  it('overskrift, merknad og tellemåte', () => {
    expect(PATSOME_TEXT.legend).toBe(patsome.legend);
    expect(PATSOME_TEXT.handicapNote).toBe(patsome.handicapNote);
    expect(PATSOME_TEXT.scoringFrom).toBe(patsome.scoringFromLabel);
    expect(PATSOME_TEXT.net).toBe(patsome.scoringNetTitle);
    expect(PATSOME_TEXT.gross).toBe(patsome.scoringGrossTitle);
    expect(PATSOME_TEXT.netDesc).toBe(patsome.scoringNetDesc);
    expect(PATSOME_TEXT.grossDesc).toBe(patsome.scoringGrossDesc);
  });

  it.each([0, 1, 2] as const)('segment %i', (i) => {
    const n = i + 1;
    const web = patsome as unknown as Record<string, string>;
    expect(PATSOME_TEXT.segments[i]).toEqual({
      holes: web[`segment${n}Holes`],
      format: web[`segment${n}Format`],
      body: web[`segment${n}Body`],
    });
  });
});

describe('scramble-familien og shamble er nettets (D3b)', () => {
  const wizard = source.wizard;

  it('lagstørrelsene', () => {
    expect(TEAM_SIZE_TEXT.legend).toBe(wizard.teamSize.legend);
    expect(TEAM_SIZE_TEXT.sizes[2]).toBe(wizard.teamSize.par.title);
    expect(TEAM_SIZE_TEXT.sizes[3]).toBe(wizard.teamSize.tremannslag.title);
    expect(TEAM_SIZE_TEXT.sizes[4]).toBe(wizard.teamSize.firemann.title);
    expect(TEAM_SIZE_TEXT.hints).toEqual({
      2: wizard.teamSize.par.hint,
      3: wizard.teamSize.tremannslag.hint,
      4: wizard.teamSize.firemann.hint,
    });
  });

  it.each([
    ['texas_scramble', 'texas'],
    ['ambrose', 'ambrose'],
    ['florida_scramble', 'florida'],
  ] as const)('lag-handicapet for %s', (mode, key) => {
    const web = wizard.allowanceProps[key] as unknown as Record<string, string>;
    expect(TEAM_HANDICAP_TEXT.legend).toBe(web.legend);
    expect(TEAM_HANDICAP_TEXT.description).toBe(web.description);
    expect(TEAM_HANDICAP_TEXT.bruttoHelper).toBe(web.bruttoHelper);
    expect(TEAM_HANDICAP_TEXT.inputLabel).toBe(web.inputLabel);
    for (const size of [2, 3, 4] as const) {
      expect(TEAM_HANDICAP_TEXT.nettoHelper[mode][size]).toBe(web[`nettoHelper${size}`]);
    }
  });

  it('summen med én desimal og komma', () => {
    const template = wizard.allowanceProps.sumEquivalent;
    expect(sumEquivalentText(12.5)).toBe(template.replace('{sumPct}', '12,5'));
    expect(sumEquivalentText(16.666)).toBe(template.replace('{sumPct}', '16,7'));
    expect(sumEquivalentText(10)).toBe(template.replace('{sumPct}', '10'));
  });

  it('shamble-oppsettet', () => {
    const web = wizard.sections.shamble;
    expect(SHAMBLE_TEXT).toMatchObject({
      legend: web.legend,
      teamSizeLabel: web.teamSizeLabel,
      teamSize: { 3: web.teamSize3Title, 4: web.teamSize4Title },
      teamSizeDesc: { 3: web.teamSize3Desc, 4: web.teamSize4Desc },
      variantLabel: web.variantLabel,
      variantShamble: web.variantShambleTitle,
      variantShambleDesc: web.variantShambleDesc,
      variantChampagne: web.variantChampagneTitle,
      variantChampagneDesc: web.variantChampagneDesc,
      countLabel: web.countLabel,
      countSingle: web.countSingle,
      countPlural: web.countPlural,
      scoringLabel: web.scoringLabel,
      net: web.scoringNetTitle,
      netDesc: web.scoringNetDesc,
      gross: web.scoringGrossTitle,
      grossDesc: web.scoringGrossDesc,
      allowanceLabel: web.allowanceLabel,
      allowanceHint: web.allowanceHint,
    });
  });
});
