// Native N3 (#1825): `expo-sqlite` for jest, rygget av better-sqlite3.
//
// expo-sqlite har ingen offisiell test-historie (SDK 57), og en håndskrevet
// fake-DB ville bare bevist at faken er enig med seg selv. Her går hvert kall
// til en EKTE sqlite-motor i minnet: `db.ts` sine migrasjoner, `INSERT OR
// REPLACE`-semantikken, primærnøkkelen på kø-elementene og rullebakken i en
// avbrutt transaksjon oppfører seg nøyaktig som på enheten.
//
// Bare subsettet datalaget faktisk kaller er implementert — dukker et nytt kall
// opp, skal testen feile på en manglende metode, ikke på en stille no-op.
import BetterSqlite3 from 'better-sqlite3';

/** Resultatformen `expo-sqlite` gir fra `runAsync`. */
export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

type BindValue = string | number | null;
type BindParams = Record<string, BindValue> | BindValue[];

/**
 * expo-sqlite binder navngitte parametre som `{ $id: … }`; better-sqlite3 vil ha
 * det bare navnet (`{ id: … }`) og kaster «Missing named parameter» på den
 * prefiksede formen. Prefikset strippes derfor her, slik at SQL-en i `db.ts` er
 * skrevet for enheten og kjører uendret i suiten.
 */
function bindable(params: BindParams): BindParams {
  if (Array.isArray(params)) return params;
  const stripped: Record<string, BindValue> = {};
  for (const [key, value] of Object.entries(params)) {
    stripped[key.replace(/^[$:@]/, '')] = value;
  }
  return stripped;
}

export class MockSQLiteDatabase {
  private readonly raw: BetterSqlite3.Database;

  constructor(raw: BetterSqlite3.Database) {
    this.raw = raw;
  }

  async execAsync(source: string): Promise<void> {
    this.raw.exec(source);
  }

  async getFirstAsync<T>(source: string, params?: BindParams): Promise<T | null> {
    const statement = this.raw.prepare(source);
    const row =
      params === undefined ? statement.get() : statement.get(bindable(params));
    return (row as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, params?: BindParams): Promise<T[]> {
    const statement = this.raw.prepare(source);
    const rows =
      params === undefined ? statement.all() : statement.all(bindable(params));
    return rows as T[];
  }

  async runAsync(
    source: string,
    params?: BindParams,
  ): Promise<SQLiteRunResult> {
    const statement = this.raw.prepare(source);
    const result =
      params === undefined ? statement.run() : statement.run(bindable(params));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  /**
   * expo-sqlite kjører oppgaven på en EGEN forbindelse; en in-memory-base kan
   * ikke deles mellom forbindelser, så her får oppgaven samme objekt. Det som
   * betyr noe for testene er transaksjons-semantikken: kaster oppgaven, rulles
   * ALT tilbake — det er den `writeScore` hviler på (score + kø-rad, aldri den
   * ene uten den andre).
   */
  async withExclusiveTransactionAsync(
    task: (txn: MockSQLiteDatabase) => Promise<void>,
  ): Promise<void> {
    this.raw.exec('BEGIN IMMEDIATE;');
    try {
      await task(this);
      this.raw.exec('COMMIT;');
    } catch (err: unknown) {
      if (this.raw.inTransaction) this.raw.exec('ROLLBACK;');
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    this.raw.close();
  }

  /** Synkron stenging for opprydding mellom tester. */
  closeForTests(): void {
    this.raw.close();
  }
}

/**
 * Én base per navn, akkurat som på enheten: to `openDatabaseAsync('torny.db')`
 * skal se de samme radene. Testene bruker det til å rigge en v1-formet base før
 * `getDb()` migrerer den.
 */
const databases = new Map<string, MockSQLiteDatabase>();

export async function openDatabaseAsync(
  databaseName: string,
): Promise<MockSQLiteDatabase> {
  const existing = databases.get(databaseName);
  if (existing) return existing;
  const opened = new MockSQLiteDatabase(new BetterSqlite3(':memory:'));
  databases.set(databaseName, opened);
  return opened;
}

/** Steng og glem alt — kalles mellom tester slik at hver test starter tom. */
export function __resetForTests(): void {
  for (const db of databases.values()) db.closeForTests();
  databases.clear();
}
