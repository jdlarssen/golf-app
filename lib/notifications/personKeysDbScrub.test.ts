/**
 * Trap 4 (AGENTS.md): the payload keys that hold a PERSON's name have two
 * homes. The schemas in `./types.ts` say which keys exist, and
 * `scrub_user_mentions` in the database (`c_person_keys`, migration 0253)
 * says which of them are replaced with «Slettet bruker» when the person
 * deletes the account.
 *
 * A new `*_name` key that is only added to the schemas would keep the name in
 * other people's inboxes after a deletion. This test reads both files and
 * fails until the new key is either in the database list (a new migration
 * that redefines the function) or in {@link NOT_A_PERSON} below.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');
const TYPES_FILE = path.resolve(__dirname, 'types.ts');

/** `*_name` keys that name a thing, not a person. */
const NOT_A_PERSON = [
  'game_name',
  'team_name',
  'course_name',
  'tee_name',
  'group_name',
  'league_name',
  'tournament_name',
] as const;

/** `c_person_keys` in the newest migration that defines it. */
function personKeysInDatabase(): string[] {
  const newest = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'))
    .find((sql) => sql.includes('c_person_keys constant text[]'));
  if (!newest) throw new Error('No migration defines c_person_keys');
  const match = newest.match(/c_person_keys constant text\[\] := array\[([^\]]*)\]/);
  if (!match) throw new Error('Could not read the c_person_keys array');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every `<something>_name:` key in the payload schemas. */
function nameKeysInSchemas(): string[] {
  const source = fs.readFileSync(TYPES_FILE, 'utf-8');
  return [...new Set([...source.matchAll(/^\s*(\w+_name):\s*z\./gm)].map((m) => m[1]))];
}

describe('person keys: payload schemas ↔ scrub_user_mentions (trap 4)', () => {
  it('every name key in the schemas is either scrubbed on deletion or listed as not a person', () => {
    const classified = new Set<string>([...personKeysInDatabase(), ...NOT_A_PERSON]);
    expect(nameKeysInSchemas().filter((key) => !classified.has(key))).toEqual([]);
  });

  it('the database list holds no key the schemas do not have', () => {
    const inSchemas = new Set(nameKeysInSchemas());
    expect(personKeysInDatabase().filter((key) => !inSchemas.has(key))).toEqual([]);
  });

  it('no key is in both lists', () => {
    const people = new Set(personKeysInDatabase());
    expect(NOT_A_PERSON.filter((key) => people.has(key))).toEqual([]);
  });

  // The first names in the organiser's evening status are an array, handled
  // by its own statement in the function.
  it('the first-name list of the evening status is still handled by name', () => {
    const source = fs.readFileSync(TYPES_FILE, 'utf-8');
    expect(source).toMatch(/unanswered_names:\s*z\.array/);
    const sql = fs
      .readdirSync(MIGRATIONS_DIR)
      .sort()
      .reverse()
      .map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8'))
      .find((text) => text.includes('c_person_keys constant text[]'));
    expect(sql).toContain("'{unanswered_names}'");
  });
});
