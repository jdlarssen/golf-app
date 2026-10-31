import { describe, it, expect } from 'vitest';
import { NOTIFICATION_ICON } from './icons';
import { NOTIFICATION_KINDS } from './types';

describe('NOTIFICATION_ICON', () => {
  it('names a drawn icon for every notification kind', () => {
    expect(Object.keys(NOTIFICATION_ICON).sort()).toEqual([...NOTIFICATION_KINDS].sort());
  });

  it('uses no emoji: names are plain lowercase words', () => {
    for (const name of Object.values(NOTIFICATION_ICON)) expect(name).toMatch(/^[a-z]+$/);
  });
});
