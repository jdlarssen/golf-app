import { describe, expect, it } from 'vitest';
import { parseReportInput, REPORT_NOTE_MAX } from './reportInput';

const U = '11111111-1111-4111-8111-111111111111';
const G = '22222222-2222-4222-8222-222222222222';

describe('parseReportInput', () => {
  it.each([
    [{ targetUserId: U, reason: 'harassment' }, { targetUserId: U, targetGameId: null, reason: 'harassment', note: null }],
    [{ targetGameId: G, reason: 'offensive', note: '  stygt  ' }, { targetUserId: null, targetGameId: G, reason: 'offensive', note: 'stygt' }],
    [{ targetGameId: G, reason: 'other', note: '   ' }, { targetUserId: null, targetGameId: G, reason: 'other', note: null }],
    [{ targetUserId: U, reason: 'other', note: 'x'.repeat(REPORT_NOTE_MAX) }, { targetUserId: U, targetGameId: null, reason: 'other', note: 'x'.repeat(REPORT_NOTE_MAX) }],
  ])('accepts %j', (body, expected) => {
    expect(parseReportInput(body)).toEqual(expected);
  });

  it.each([
    [null],
    ['tekst'],
    [{ reason: 'other' }],
    [{ targetUserId: U, targetGameId: G, reason: 'other' }],
    [{ targetUserId: 'ikke-en-id', reason: 'other' }],
    [{ targetUserId: U, targetGameId: 'søppel', reason: 'other' }],
    [{ targetUserId: U, reason: 'spam' }],
    [{ targetUserId: U }],
    [{ targetUserId: U, reason: 'other', note: 'x'.repeat(REPORT_NOTE_MAX + 1) }],
    [{ targetUserId: U, reason: 'other', note: 42 }],
  ])('refuses %j', (body) => {
    expect(parseReportInput(body)).toBeNull();
  });
});
