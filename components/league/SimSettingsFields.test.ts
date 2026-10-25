import { describe, it, expect } from 'vitest';
import { countSave, type SimSettingsSaveState } from './SimSettingsFields';

// #2638 (the orchestrator's check of 8e8858cad): the save count goes into the
// fields' key, so they start over after every successful save, also one that
// stored the same values. A failed save keeps the count and shows the error.
describe('countSave', () => {
  it.each([
    ['a successful save counts', { error: '', saves: 2 }, { error: '' }, { error: '', saves: 3 }],
    ['a failed save keeps the count', { error: '', saves: 2 }, { error: 'update_failed' }, { error: 'update_failed', saves: 2 }],
    ['a save after a failure clears the error and counts', { error: 'update_failed', saves: 2 }, { error: '' }, { error: '', saves: 3 }],
  ] as Array<[string, SimSettingsSaveState, { error: string }, SimSettingsSaveState]>)('%s', (_label, prev, result, next) => {
    expect(countSave(prev, result)).toEqual(next);
  });
});
