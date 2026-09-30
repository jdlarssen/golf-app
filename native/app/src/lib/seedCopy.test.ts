// #2255 PR 3a: linja når slagene ikke kom fra serveren.
import { isFinishedSentence } from '../test/copy';
import { CHOICES_MISSING_BOARD_TEXT, CHOICES_MISSING_HOLES_TEXT, SEED_FAILED_TEXT } from './seedCopy';

it('er en ferdig setning', () => {
  expect(isFinishedSentence(SEED_FAILED_TEXT)).toBe(true);
});

it('valgene som mangler: tavla beholder sin tekst, og begge er ferdige setninger', () => {
  expect(CHOICES_MISSING_BOARD_TEXT).toBe(
    'Fikk ikke tak i valgene som avgjør poengene. Tabellen kommer når nettet er tilbake.',
  );
  expect(isFinishedSentence(CHOICES_MISSING_HOLES_TEXT)).toBe(true);
});
