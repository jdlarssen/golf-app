import { describe, it, expect } from 'vitest';
import { displayNameForOthers } from './displayName';

describe('displayNameForOthers', () => {
  it('eier med navn gir navnet', () => {
    expect(
      displayNameForOthers({ name: 'Ola Nordmann', email: 'ola@gmail.com' }),
    ).toBe('Ola Nordmann');
  });

  it('eier uten navn gir maskert adresse, aldri hele lokaldelen', () => {
    const result = displayNameForOthers({ name: null, email: 'olanordmann@example.com' });
    expect(result).toBe('ol•••@example.com');
    expect(result).not.toContain('olanordmann');
  });

  it.each([
    ['tom streng', ''],
    ['bare mellomrom', '   '],
  ])('navn med %s gir maskert adresse', (_label, name) => {
    expect(displayNameForOthers({ name, email: 'ola@gmail.com' })).toBe(
      'ol•••@gmail.com',
    );
  });

  it('trimmer navnet', () => {
    expect(displayNameForOthers({ name: '  Ola  ', email: 'ola@gmail.com' })).toBe('Ola');
  });

  it('kallenavn står i «»', () => {
    expect(
      displayNameForOthers({ name: 'Ola', nickname: 'Olan', email: 'ola@gmail.com' }),
    ).toBe('Ola «Olan»');
  });

  it('kallenavn står i «» også bak maskert adresse', () => {
    expect(
      displayNameForOthers({ name: null, nickname: 'Olan', email: 'ola@gmail.com' }),
    ).toBe('ol•••@gmail.com «Olan»');
  });

  it.each([
    ['null', null],
    ['tom streng', ''],
  ])('verken navn eller e-post (%s) gir null', (_label, email) => {
    expect(displayNameForOthers({ name: null, email })).toBeNull();
    expect(displayNameForOthers({ name: '  ', nickname: 'Olan', email })).toBeNull();
  });
});
