/**
 * Felle 4-avstemming (AGENTS.md): TS-unionen ↔ DB-ens CHECK må si det samme.
 *
 * `card_kind` har to hjem — `KAVALKADE_CARD_KINDS` her i koden, og
 * CHECK-constrainten i `supabase/migrations/0183_kavalkade_shares.sql`. Legger
 * noen til et kort bare det ene stedet, blir enten delingen avvist på en rad
 * ingen har sett komme (23514), eller databasen tar imot en slug ingen rute
 * kjenner. Testen leser migrasjonen og feiler hvis lista går fra hverandre.
 *
 * Mønsteret er kopiert fra `lib/courses/teeRatingDbCheck.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { KAVALKADE_CARD_KINDS } from './cardModel';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../supabase/migrations/0183_kavalkade_shares.sql',
);

/** Slug-ene i `card_kind in ( … )`, i den rekkefølgen migrasjonen lister dem. */
function kindsInMigration(): string[] {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf-8');
  const match = sql.match(/card_kind\s+in\s*\(([^)]*)\)/i);
  if (!match) throw new Error('Fant ikke CHECK-lista for card_kind i 0183');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('card_kind: TS-union ↔ DB CHECK (felle 4)', () => {
  it('lister nøyaktig de samme kortene, i samme rekkefølge', () => {
    expect(kindsInMigration()).toEqual([...KAVALKADE_CARD_KINDS]);
  });

  it('har ingen duplikater', () => {
    expect(new Set(KAVALKADE_CARD_KINDS).size).toBe(KAVALKADE_CARD_KINDS.length);
  });
});
