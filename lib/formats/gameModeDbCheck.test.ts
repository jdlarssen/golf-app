/**
 * Trap #4 agreement test (AGENTS.md): validator ↔ DB CHECK must stay in sync.
 *
 * games.game_mode is constrained by CHECK in 0111_games_game_mode_validity.sql.
 * The same set of valid slugs lives in the validator isValidActiveGameMode
 * (lib/formats/validateGameMode.ts), which queries formats.slug dynamically.
 *
 * This test asserts that the static list baked into the DB CHECK mirrors
 * all format slugs that are seeded in supabase/migrations/, so that a new
 * format migration that forgets to update the CHECK (or vice versa) surfaces
 * as a failing test before hitting staging.
 *
 * Note: isValidActiveGameMode queries the DB at runtime — this test does NOT
 * mock the DB. Instead it verifies structural agreement between:
 *   (a) the slug list in migration 0111 (the DB CHECK)
 *   (b) all slugs seeded via INSERT INTO public.formats in migrations 0047–0065
 *
 * Both lists are extracted from the SQL files on disk so the test stays in sync
 * automatically when new format migrations add slugs to both places.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations');

/** Extract all slugs from INSERT INTO public.formats … VALUES (slug, …) statements.
 *
 * Handles both single-value inserts (one row after VALUES) and multi-value inserts
 * (multiple rows after VALUES, each starting with `(`). In both cases the first
 * column is the slug, so we match every `('slug',` or `('slug' ` occurrence that
 * appears after an INSERT INTO public.formats header in the file.
 */
function extractSeededSlugs(): Set<string> {
  const files = fs.readdirSync(MIGRATIONS_DIR).sort();
  const slugs = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

    // Find all INSERT INTO public.formats blocks and extract the VALUES body.
    // Strategy: split on the keyword, then from each occurrence scan for
    // every ('slug' occurrence (first column of each row).
    const parts = content.split(/insert into public\.formats\b/i);
    // parts[0] is before the first INSERT; parts[1..] each start after the keyword.
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i];
      // Extract everything from VALUES( to the first semicolon.
      const valuesMatch = block.match(/values\s*([\s\S]*?);/i);
      if (!valuesMatch) continue;
      const valuesBody = valuesMatch[1];
      // Every row starts with ('slug'... — extract the slug from each.
      const rowSlugs = valuesBody.matchAll(/\(\s*'([a-z_]+)'/g);
      for (const m of rowSlugs) {
        slugs.add(m[1]);
      }
    }
  }

  return slugs;
}

/** Extract the slug list from the games_game_mode_check constraint in 0111. */
function extractCheckSlugs(): Set<string> {
  const constraintFile = path.join(MIGRATIONS_DIR, '0111_games_game_mode_validity.sql');
  const content = fs.readFileSync(constraintFile, 'utf-8');

  // Find the CHECK ( game_mode in ( … ) ) block and extract all 'slug' values.
  const blockMatch = content.match(/add constraint games_game_mode_check check \(\s*game_mode in \(([\s\S]*?)\)\s*\)/i);
  if (!blockMatch) throw new Error('Could not find games_game_mode_check constraint in 0111');

  const slugs = new Set<string>();
  const slugMatches = blockMatch[1].matchAll(/'([a-z_]+)'/g);
  for (const m of slugMatches) {
    slugs.add(m[1]);
  }
  return slugs;
}

describe('games_game_mode_check DB ↔ formats seed agreement (trap #4)', () => {
  it('DB CHECK slug list includes every slug seeded in public.formats migrations', () => {
    const seeded = extractSeededSlugs();
    const inCheck = extractCheckSlugs();

    const missingFromCheck = [...seeded].filter((s) => !inCheck.has(s));

    expect(missingFromCheck, [
      'The following slugs are seeded into public.formats but missing from the',
      'games_game_mode_check constraint in 0111_games_game_mode_validity.sql.',
      'Add them to the CHECK list so the DB validates game_mode correctly.',
      `Missing: ${missingFromCheck.join(', ')}`,
    ].join('\n')).toEqual([]);
  });

  it('every slug in DB CHECK is seeded into public.formats (no phantom slugs)', () => {
    const seeded = extractSeededSlugs();
    const inCheck = extractCheckSlugs();

    const phantomInCheck = [...inCheck].filter((s) => !seeded.has(s));

    expect(phantomInCheck, [
      'The following slugs are in the games_game_mode_check constraint but NOT',
      'seeded into public.formats in any migration. Remove them from the CHECK',
      'or add the missing format seed migration.',
      `Phantom: ${phantomInCheck.join(', ')}`,
    ].join('\n')).toEqual([]);
  });

  it('CHECK list is non-empty and contains the known baseline formats', () => {
    const inCheck = extractCheckSlugs();
    const baseline = [
      'stableford', 'best_ball', 'texas_scramble', 'solo_strokeplay',
      'singles_matchplay', 'fourball_matchplay',
    ];
    for (const slug of baseline) {
      expect(inCheck.has(slug), `Expected '${slug}' in games_game_mode_check`).toBe(true);
    }
    // Sanity: at least 20 slugs (22 as of 0111)
    expect(inCheck.size).toBeGreaterThanOrEqual(20);
  });
});
