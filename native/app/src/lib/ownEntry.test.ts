import { ownEntry } from './ownEntry';
import { detailsFailureText, setupLoadFailureText } from './cupSetupCopy';
import { startFailureText } from './cupGenerateCopy';
import { lineupFailureText } from './cupLineupCopy';
import { matchFinishFailureText } from './cupManageCopy';

describe('ownEntry', () => {
  it('gir egne nøkler og ingenting fra Object.prototype', () => {
    const table = { a: 'x' };
    expect(ownEntry(table, 'a')).toBe('x');
    expect(ownEntry(table, 'constructor')).toBeUndefined();
    expect(ownEntry(table, 'toString')).toBeUndefined();
  });

  it('feilkoder som heter som objektmetoder gir tekst, ikke en funksjon', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(typeof detailsFailureText(code)).toBe('string');
      expect(typeof setupLoadFailureText(code)).toBe('string');
      expect(typeof startFailureText(code)).toBe('string');
      expect(typeof lineupFailureText(code)).toBe('string');
      expect(typeof matchFinishFailureText(code)).toBe('string');
    }
  });
});
