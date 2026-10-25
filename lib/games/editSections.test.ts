import { describe, expect, it } from 'vitest';
import { EDIT_SECTIONS, isEditSection } from './editSections';

describe('isEditSection (#2322)', () => {
  it.each(EDIT_SECTIONS)('accepts %s', (key) => {
    expect(isEditSection(key)).toBe(true);
  });

  it.each([[''], ['BANE'], ['../x'], [null], [undefined], [3]])('rejects %j', (value) => {
    expect(isEditSection(value)).toBe(false);
  });

  it('has the six parts in the overview order', () => {
    expect(EDIT_SECTIONS).toEqual([
      'navn-og-tid',
      'bane',
      'format',
      'spillere',
      'pamelding',
      'innstillinger',
    ]);
  });
});
