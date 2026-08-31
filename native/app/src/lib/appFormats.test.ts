// native/app/src/lib/appFormats.test.ts
// Paritets-porten mellom appens format-etiketter og webbens `messages/no.json`.
//
// Samme grep som `sideTournamentCopy.test.ts`: `no.json` leses fra node-siden
// (testen bundles aldri), og likheten kreves tegn for tegn. Rettes «Modifisert
// Stableford» på web uten at appen følger etter, blir CI rød i stedet for at to
// flater viser hvert sitt navn på samme format.
import source from '../../../../messages/no.json';
import {
  APP_MODE_LABELS,
  APP_SUPPORTED_MODES,
  MODES_WITH_TEAM_ASSIGNMENT,
  isAppSupportedMode,
  usesTeamAssignment,
} from './appFormats';

const modeSource = source.modes as Record<string, string>;

describe('APP_SUPPORTED_MODES', () => {
  it('er de åtte modiene kontrakten navngir', () => {
    expect([...APP_SUPPORTED_MODES]).toEqual([
      'stableford',
      'modified_stableford',
      'singles_matchplay',
      'best_ball',
      'greensome_matchplay',
      'wolf',
      'bingo_bango_bongo',
      'skins',
    ]);
  });

  it('har ingen duplikater', () => {
    expect(new Set(APP_SUPPORTED_MODES).size).toBe(APP_SUPPORTED_MODES.length);
  });

  it('isAppSupportedMode slipper gjennom de åtte og ingen andre', () => {
    for (const mode of APP_SUPPORTED_MODES) {
      expect(isAppSupportedMode(mode)).toBe(true);
    }
    // Aktive formater på web som appen bevisst IKKE tilbyr.
    for (const mode of ['patsome', 'texas_scramble', 'nassau', 'nines', '']) {
      expect(isAppSupportedMode(mode)).toBe(false);
    }
  });
});

describe('paritet med messages/no.json', () => {
  it.each(APP_SUPPORTED_MODES)('modes.%s er identisk med kilden', (slug) => {
    expect(APP_MODE_LABELS[slug]).toBe(modeSource[slug]);
  });

  it('har en etikett per modus og ingen etikett uten modus', () => {
    expect(Object.keys(APP_MODE_LABELS).sort()).toEqual(
      [...APP_SUPPORTED_MODES].sort(),
    );
  });
});

describe('usesTeamAssignment', () => {
  it('gjelder de tre lag-/side-modiene', () => {
    expect([...MODES_WITH_TEAM_ASSIGNMENT]).toEqual([
      'best_ball',
      'singles_matchplay',
      'greensome_matchplay',
    ]);
  });

  // #969: wolf-slottene trekkes ved START, ikke ved publisering. En veiviser
  // som tildelte lag her ville vist et tall som blir overskrevet.
  it.each(['wolf', 'stableford', 'modified_stableford', 'skins', 'bingo_bango_bongo'] as const)(
    '%s har ingen lag-tildeling i veiviseren',
    (mode) => {
      expect(usesTeamAssignment(mode)).toBe(false);
    },
  );
});
