// native/app/src/lib/syncChipCopy.test.ts
// #2348: tekstene i lagringsbrikka og arket. Tallet i brikka er slag, ikke hull,
// og «når nettet er tilbake» står bare når det er nettet som mangler.
import { SYNC_CHIP_TEXT, cellA11yLabel, pendingText, retakeHoleText, syncChipText } from './syncChipCopy';

describe('syncChipText', () => {
  it.each([
    ['saved', 0, 0, 'Alt er lagret'],
    ['pending', 9, 0, '9 slag på telefonen'],
    ['pending', 1, 0, '1 slag på telefonen'],
    ['pending', 0, 0, 'Lagret på telefonen'],
    ['quarantined', 3, 1, '1 hull ikke lagret'],
    ['quarantined', 0, 2, '2 hull ikke lagret'],
  ] as const)('%s, %i slag, %i hull → %s', (state, pendingScoreCount, quarantinedHoleCount, expected) => {
    expect(syncChipText(state, { pendingScoreCount, quarantinedHoleCount })).toBe(expected);
  });
});

describe('pendingText', () => {
  it('artboardets setning når nettet mangler', () => {
    expect(
      pendingText({ holes: [7, 8, 9], pendingScoreCount: 3, pendingTeeShotCount: 0, waitingForNetwork: true }),
    ).toBe('Slagene fra hull 7, 8 og 9 er lagret på telefonen og sendes av seg selv når nettet er tilbake.');
  });

  it('lover bare et nytt forsøk når grunnen er en annen enn nettet', () => {
    expect(
      pendingText({ holes: [7, 8], pendingScoreCount: 2, pendingTeeShotCount: 0, waitingForNetwork: false }),
    ).toBe('Slagene fra hull 7 og 8 er lagret på telefonen. Appen prøver å sende dem igjen.');
  });

  it('ett slag i entall, og utslagsvalg kalles ikke slag', () => {
    expect(
      pendingText({ holes: [4], pendingScoreCount: 1, pendingTeeShotCount: 1, waitingForNetwork: false }),
    ).toBe('Slaget fra hull 4 er lagret på telefonen. Appen prøver å sende det igjen.');
    expect(
      pendingText({ holes: [9], pendingScoreCount: 0, pendingTeeShotCount: 1, waitingForNetwork: true }),
    ).toBe('Utslagsvalget fra hull 9 er lagret på telefonen og sendes av seg selv når nettet er tilbake.');
  });
});

it('arket, lenka og skjermleseren', () => {
  expect(SYNC_CHIP_TEXT.sheetTitle).toBe('Trygt på telefonen');
  // Eierens svar 2: «appen», ikke «runden».
  expect(SYNC_CHIP_TEXT.keepGoing).toBe(
    'Fortsett å taste som vanlig. Lukker du appen, blir slagene liggende på telefonen til du åpner den igjen med nett.',
  );
  expect(retakeHoleText(7)).toBe('Tast hull 7 på nytt');
  expect(cellA11yLabel(7, 'pending')).toBe('Hull 7: på telefonen');
  expect(cellA11yLabel(2, 'empty')).toBe('Hull 2: ikke tastet');
});
