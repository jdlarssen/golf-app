// #2577: tekstene på godkjenningen (Type A). Ordlyden er designlerretets
// (rad 68 «Godkjenningen i appen»).
import {
  APPROVE_TEXT,
  approvedLine,
  deliveredLine,
  notDeliveredHintFor,
  notifiedLine,
  pendingHeading,
  positionLabel,
  rejectSheetText,
} from './approveCopy';

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

describe('linjene under navnet i radene', () => {
  // Uten synlige slag faller tallet bort (beslutning 3); uten tidspunkt står ordet alene.
  it.each([
    [deliveredLine('14:35', 72), 'Levert 14:35 · 72 slag'],
    [deliveredLine('14:35', null), 'Levert 14:35'],
    [deliveredLine(null, null), 'Levert'],
    [approvedLine('14:41'), 'Godkjent 14:41'],
    [approvedLine(null), 'Godkjent'],
  ])('«%s»', (actual, expected) => {
    expect(actual).toBe(expected);
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

// #2560: «Du får beskjed når kortet kommer» er ikke sant på Android. Der finnes
// ingen push, ingen e-post for dette og ingen innboks, så kortet er først å se
// når appen åpnes igjen.
describe('notDeliveredHintFor (#2560)', () => {
  it('gir iOS designets tekst', () => {
    expect(notDeliveredHintFor('ios')).toBe(APPROVE_TEXT.notDeliveredHint);
    expect(APPROVE_TEXT.notDeliveredHint).toBe('Du får beskjed når kortet kommer.');
  });

  it('gir Android en tekst som ikke lover noen beskjed', () => {
    expect(notDeliveredHintFor('android')).toBe('Kortet står her når det er levert.');
    expect(notDeliveredHintFor('android')).not.toMatch(/beskjed|varsl|push/i);
  });
});
