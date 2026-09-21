// native/app/src/lib/allowanceCopy.test.ts
// Native #1980: paritetsport mot webbens HCP-andel-felt. Rettes en tekst i
// `messages/no.json` uten at appen følger etter, blir denne rød.
import source from '../../../../messages/no.json';
import { bruttoHelperKeyFor } from '../../../../lib/games/allowanceCopy';
import {
  ALLOWANCE_TEXT,
  BRUTTO_HELPER,
  HCP_ALLOWANCE_MODES,
  hasHcpAllowanceField,
} from './allowanceCopy';

const scoring = source.wizard.allowanceProps.scoring;
const allowance = source.allowance as unknown as {
  nettoLabel: string;
  bruttoLabel: string;
  inputLabelDefault: string;
  bruttoHelper: Record<string, string>;
};

describe('ALLOWANCE_TEXT', () => {
  it('bruker webbens tekster tegn for tegn', () => {
    expect(ALLOWANCE_TEXT.legend).toBe(scoring.legend);
    expect(ALLOWANCE_TEXT.description).toBe(scoring.description);
    expect(ALLOWANCE_TEXT.nettoHelper).toBe(scoring.nettoHelper);
    expect(ALLOWANCE_TEXT.nettoLabel).toBe(allowance.nettoLabel);
    expect(ALLOWANCE_TEXT.bruttoLabel).toBe(allowance.bruttoLabel);
    expect(ALLOWANCE_TEXT.inputLabel).toBe(allowance.inputLabelDefault);
  });

  it.each(HCP_ALLOWANCE_MODES)('brutto-teksten for %s er webbens', (mode) => {
    const key = bruttoHelperKeyFor(mode).replace('bruttoHelper.', '');
    expect(BRUTTO_HELPER[mode]).toBe(allowance.bruttoHelper[key]);
  });
});

describe('hasHcpAllowanceField', () => {
  it('gjelder de fire formatene webben viser feltet for, ikke greensome', () => {
    expect(hasHcpAllowanceField('stableford')).toBe(true);
    expect(hasHcpAllowanceField('best_ball')).toBe(true);
    expect(hasHcpAllowanceField('greensome_matchplay')).toBe(false);
    expect(hasHcpAllowanceField('wolf')).toBe(false);
  });
});
