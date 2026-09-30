// #2255 PR 3a: linja når slagene ikke kom fra serveren.
import { isFinishedSentence } from '../test/copy';
import { SEED_FAILED_TEXT } from './seedCopy';

it('er en ferdig setning', () => {
  expect(isFinishedSentence(SEED_FAILED_TEXT)).toBe(true);
});
