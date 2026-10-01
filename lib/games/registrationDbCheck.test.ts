/**
 * Trap #4 agreement test (AGENTS.md, #2222): the signup text limits live in
 * `registration.ts` (read by the forms and the server actions), in the DB
 * CHECKs on `game_registration_requests`, and as numbers written into four
 * messages. Change one without the others and this goes red. The test reads
 * the LAST migration defining each constraint, not 0042 by name.
 */
import { describe, it, expect } from 'vitest';
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { lastMigrationMatch } from '@/lib/__tests__/migrationCheck';
import {
  REGISTRATION_MESSAGE_MAX,
  REJECTION_REASON_MAX,
  TEAM_NAME_MAX,
  TEAM_NAME_MIN,
} from './registration';

const TEAM_NAME_RE =
  /\bteam_captain_has_name\s+check\s*\([\s\S]*?length\(team_name\)\s+between\s+(\d+)\s+and\s+(\d+)/i;
// `\b` keeps the clubs' `group_join_message_length` (0075) out: there the name
// continues a word, so it has no boundary before `message`.
const MESSAGE_RE =
  /\bmessage_length\s+check\s*\(\s*message\s+is\s+null\s+or\s+length\(message\)\s*<=\s*(\d+)/i;
const REASON_RE =
  /\brejection_reason_length\s+check\s*\(\s*rejection_reason\s+is\s+null\s+or\s+length\(rejection_reason\)\s*<=\s*(\d+)/i;

describe('game_registration_requests CHECKs ↔ registration.ts (#2222)', () => {
  it('team_captain_has_name uses TEAM_NAME_MIN..TEAM_NAME_MAX', () => {
    const { match } = lastMigrationMatch(TEAM_NAME_RE);
    expect(Number(match[1])).toBe(TEAM_NAME_MIN);
    expect(Number(match[2])).toBe(TEAM_NAME_MAX);
  });

  it('message_length uses REGISTRATION_MESSAGE_MAX', () => {
    const { match } = lastMigrationMatch(MESSAGE_RE);
    expect(Number(match[1])).toBe(REGISTRATION_MESSAGE_MAX);
  });

  it('rejection_reason_length uses REJECTION_REASON_MAX', () => {
    const { match } = lastMigrationMatch(REASON_RE);
    expect(Number(match[1])).toBe(REJECTION_REASON_MAX);
  });

  it('the clubs’ group_join_message_length is not mistaken for message_length', () => {
    expect(
      'constraint group_join_message_length check (message is null or length(message) <= 200)',
    ).not.toMatch(MESSAGE_RE);
  });
});

describe('the signup messages state the same limits (#2222)', () => {
  const get = (messages: unknown, key: string): string =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages) as string;

  const cases = [
    ['signup.teamNameLabel', [TEAM_NAME_MIN, TEAM_NAME_MAX]],
    ['signup.errors.team_name_invalid', [TEAM_NAME_MIN, TEAM_NAME_MAX]],
    ['signup.errors.message_too_long', [REGISTRATION_MESSAGE_MAX]],
    ['admin.game.signups.errors.reason_too_long', [REJECTION_REASON_MAX]],
  ] as const;

  it.each(
    cases.flatMap(([key, numbers]) => [
      ['no', key, numbers, get(noMessages, key)],
      ['en', key, numbers, get(enMessages, key)],
    ]),
  )('%s: %s nevner %j', (_locale, _key, numbers, text) => {
    for (const n of numbers) expect(text).toContain(String(n));
  });
});
