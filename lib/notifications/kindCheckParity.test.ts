import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NOTIFICATION_KINDS } from './types';

/**
 * #2268: a notification kind lives in two layers, the CHECK constraint
 * `notifications_kind_check` and the TypeScript union. A kind in TypeScript
 * that the CHECK lacks is refused at insert, and `notify` only logs it: no
 * inbox row, no push, no mail (cup_signup shipped that way once). This holds
 * the two lists equal by reading the newest migration that re-adds the CHECK.
 */
it('the newest notifications_kind_check lists exactly the TypeScript kinds', () => {
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const latest = files
    .map((f) => ({ f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }))
    .filter(({ sql }) => /add constraint notifications_kind_check/i.test(sql))
    .at(-1);
  expect(latest, 'a migration adds notifications_kind_check').toBeDefined();

  const check = latest!.sql.slice(latest!.sql.search(/add constraint notifications_kind_check/i));
  const list = check.slice(check.indexOf('('), check.indexOf(';'));
  const sqlKinds = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  expect([...sqlKinds].sort()).toEqual([...NOTIFICATION_KINDS].sort());
});
