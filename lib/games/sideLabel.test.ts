import { describe, expect, it } from 'vitest';
import { sideLabel } from './sideLabel';

describe('sideLabel', () => {
  it('one prize of the kind: the bare label', () => {
    expect(sideLabel('Lengste drive', 1, 1)).toBe('Lengste drive');
  });

  it('two of the kind: numbered by position', () => {
    expect(sideLabel('Lengste drive', 2, 2)).toBe('Lengste drive 2');
  });
});
