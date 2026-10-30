import { describe, it, expect } from 'vitest';
import no from './no.json';
import en from './en.json';

/**
 * #2459: Home's «Fortsett der du slapp» card sits on a route without the heavy
 * `wizard` namespace, so it carries its own copy of the five step titles. A rule
 * has one home: this test fails when the copy drifts from `wizard.stepTitle`.
 */
describe.each([
  ['no', no],
  ['en', en],
] as const)('resumeDraft.stepTitle (%s)', (_locale, catalog) => {
  it('is the same text as wizard.stepTitle for steps 1–5', () => {
    for (const step of ['1', '2', '3', '4', '5'] as const) {
      expect(catalog.resumeDraft.stepTitle[step]).toBe(catalog.wizard.stepTitle[step]);
    }
  });
});
