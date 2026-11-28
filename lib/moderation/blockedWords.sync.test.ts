// Trap 4: the word list and the length caps have a TS home and a SQL copy.
// This test reads the newest migration that defines each and fails when the
// two drift.
import { describe, expect, it } from 'vitest';
import { lastMigrationMatch } from '@/lib/__tests__/migrationCheck';
import { BLOCKED_WORDS, LEET_FROM, LEET_TO } from './blockedWords';
import {
  COURSE_NAME_MAX,
  GAME_NAME_MAX,
  NICKNAME_MAX,
  PLAYER_NAME_MAX,
  TEE_NAME_MAX,
} from './textLimits';

describe('contains_blocked_word in the database', () => {
  const { match } = lastMigrationMatch(
    /-- blocked-words:start([\s\S]*?)-- blocked-words:end/,
  );
  const body = match[1];

  it('holds the same words as BLOCKED_WORDS', () => {
    const list = body.match(/&& array\[([\s\S]*?)\]::text\[\]/);
    expect(list).not.toBeNull();
    const words = [...list![1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    expect(words).toEqual([...BLOCKED_WORDS]);
  });

  it('undoes the same digit swaps', () => {
    expect(body).toContain(`translate(lower(p_text), '${LEET_FROM}', '${LEET_TO}')`);
  });
});

describe('length caps in the database', () => {
  const capFor = (detail: string, guard: RegExp): number => {
    const { match } = lastMigrationMatch(guard);
    const re = new RegExp(
      `char_length\\(new\\.(\\w+)\\) > (\\d+) then\\s+raise exception 'text_too_long'[^;]*detail = '${detail.replace('.', '\\.')}'`,
    );
    const hit = match[0].match(re);
    expect(hit, detail).not.toBeNull();
    return Number(hit![2]);
  };
  const usersGuard = /function public\.guard_users_blocked_words\(\)[\s\S]*?\$\$;/;
  const gamesGuard = /function public\.guard_games_blocked_words\(\)[\s\S]*?\$\$;/;
  const nameGuard = /function public\.guard_name_blocked_words\(\)[\s\S]*?\$\$;/;

  it('users.name and users.nickname', () => {
    expect(capFor('users.name', usersGuard)).toBe(PLAYER_NAME_MAX);
    expect(capFor('users.nickname', usersGuard)).toBe(NICKNAME_MAX);
  });

  it('games.name', () => {
    expect(capFor('games.name', gamesGuard)).toBe(GAME_NAME_MAX);
  });

  it('courses.name and tee_boxes.name share one cap', () => {
    const { match } = lastMigrationMatch(nameGuard);
    const hit = match[0].match(/char_length\(new\.name\) > (\d+) then\s+raise exception 'text_too_long'/);
    expect(Number(hit![1])).toBe(COURSE_NAME_MAX);
    expect(TEE_NAME_MAX).toBe(COURSE_NAME_MAX);
  });
});
