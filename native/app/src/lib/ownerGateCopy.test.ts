// native/app/src/lib/ownerGateCopy.test.ts
// Native #1959: paritetsport mot webben. Sperren etter en feilet eierbytte-wipe
// skal forklares med de samme ordene i appen og på nettsiden; rettes setningen
// i `messages/no.json` uten at appen følger etter, blir denne rød.
import source from '../../../../messages/no.json';
import { OWNER_GATE_TEXT } from './ownerGateCopy';

describe('OWNER_GATE_TEXT', () => {
  it('bruker webbens setning og knappetekst tegn for tegn', () => {
    expect(OWNER_GATE_TEXT.wipeFailed).toBe(source.SyncBanner.ownerWipeFailed);
    expect(OWNER_GATE_TEXT.retry).toBe(source.SyncBanner.retry);
  });

  it('har ingen tomme tekster', () => {
    for (const text of Object.values(OWNER_GATE_TEXT)) {
      expect(text.trim()).not.toBe('');
    }
  });
});
