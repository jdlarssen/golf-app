import { describe, it, expect } from 'vitest';
import { formatPublicName } from './formatPublicName';

describe('formatPublicName', () => {
  it.each<[string, { name: string | null; nickname: string | null }, string | null]>([
    ['first + last initial', { name: 'Ola Nordmann', nickname: null }, 'Ola N.'],
    ['middle names skipped, last initial wins', { name: 'Kari Anne Nordmann Hansen', nickname: null }, 'Kari H.'],
    ['single name stays as-is', { name: 'Ola', nickname: null }, 'Ola'],
    ['nickname is ignored when a name exists', { name: 'Ola Nordmann', nickname: 'Knerten' }, 'Ola N.'],
    ['nickname is the fallback without a name', { name: null, nickname: 'Knerten' }, 'Knerten'],
    ['whitespace-only name falls back to nickname', { name: '   ', nickname: 'Knerten' }, 'Knerten'],
    ['nothing to show → null', { name: null, nickname: null }, null],
    ['extra whitespace is normalized', { name: '  Ola   Nordmann  ', nickname: null }, 'Ola N.'],
  ])('%s', (_label, input, expected) => {
    expect(formatPublicName(input)).toBe(expected);
  });
});
