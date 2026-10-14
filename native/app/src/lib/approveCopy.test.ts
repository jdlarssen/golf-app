// #2577: tekstene på godkjenningen (Type A). Ordlyden er designlerretets
// (rad 68 «Godkjenningen i appen»).
import { notifiedLine, pendingHeading, positionLabel, rejectSheetText } from './approveCopy';

describe('notifiedLine', () => {
  it.each([
    [[], null],
    [['Marte'], 'Marte får beskjed om at kortet er godkjent.'],
    [['Marte', 'Jonas'], 'Marte og Jonas får beskjed om at kortene deres er godkjent.'],
    [
      ['Marte', 'Jonas', 'Kristian'],
      'Marte, Jonas og Kristian får beskjed om at kortene deres er godkjent.',
    ],
  ])('%j', (names, expected) => {
    expect(notifiedLine(names)).toBe(expected);
  });
});

describe('overskriften og plassen', () => {
  it.each([
    [1, '1 kort venter på deg'],
    [3, '3 kort venter på deg'],
  ])('%i kort', (n, expected) => {
    expect(pendingHeading(n)).toBe(expected);
  });

  it('«2 av 3»', () => {
    expect(positionLabel(2, 3)).toBe('2 av 3');
  });
});

describe('arket', () => {
  it.each([
    ['vanlig kort', { name: 'Marte', teamCard: false, guest: false }],
    ['lagkort', { name: 'Marte', teamCard: true, guest: false }],
    ['gjestekort', { name: 'Gjest', teamCard: false, guest: true }],
    ['gjest på lagkort', { name: 'Gjest', teamCard: true, guest: true }],
  ])('%s', (_, input) => {
    expect(rejectSheetText(input)).toMatchSnapshot();
  });
});
