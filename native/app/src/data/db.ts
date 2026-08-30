// Native N2 (#1823): lokal-først lager på expo-sqlite.
//
// Speiler webbens Dexie-lag (`lib/sync/db.ts`) felt for felt og bruker EKSAKT
// de samme TS-typene — de type-importeres derfra, ikke kopieres. Type-import er
// runtime-fri (babel stripper `import type`), så Dexie følger aldri med inn i
// app-bundelen. Fordelen er at de delte beslutningsmodulene (`conflict.ts`,
// `classifyError.ts`, `queueScope.ts`) kan konsumeres rett fra repo-kilden uten
// noen oversettelse i mellom: en `LocalScore` her ER en `LocalScore` der.
//
// Kolonnene er snake_case (SQL-skikk), typene camelCase (delt kontrakt).
// Mappingen mellom dem bor KUN i dette laget — ingen annen fil ser en rå rad.
import * as SQLite from 'expo-sqlite';
import type {
  ConflictRecord,
  LocalScore,
  SyncQueueItem,
} from '../../../../lib/sync/db';

export type { ConflictRecord, LocalScore, SyncQueueItem };

const DATABASE_NAME = 'torny.db';

/** Bumpes når skjemaet endres; styrer `PRAGMA user_version`-migrasjonen. */
const SCHEMA_VERSION = 1;

/**
 * Nøkkelen for én score-rad. Speiler `scoreKey` i `lib/sync/db.ts` — den kan
 * ikke importeres som verdi, for den fila instansierer Dexie på modulnivå.
 * Formatet er delt kontrakt: `queueScope.belongsToGame` prefiks-tester på den.
 */
export function scoreKey(
  gameId: string,
  userId: string,
  holeNumber: number,
): string {
  return `${gameId}:${userId}:${holeNumber}`;
}

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hole_number INTEGER NOT NULL,
  strokes INTEGER,
  putts INTEGER,
  entered_by TEXT NOT NULL,
  client_updated_at TEXT NOT NULL,
  server_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS scores_game_idx ON scores (game_id);
CREATE INDEX IF NOT EXISTS scores_game_user_idx ON scores (game_id, user_id);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  score_id TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  abandoned_at TEXT
);
CREATE INDEX IF NOT EXISTS sync_queue_created_idx ON sync_queue (created_at);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY NOT NULL,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  hole_number INTEGER NOT NULL,
  local_strokes INTEGER,
  server_strokes INTEGER,
  resolved_at TEXT NOT NULL,
  for_own_score INTEGER
);
CREATE INDEX IF NOT EXISTS conflicts_game_idx ON conflicts (game_id);
`;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // WAL er nødvendig, ikke pynt: `withExclusiveTransactionAsync` skriver på en
  // EGEN forbindelse, og bare i WAL kan en lesing på denne forbindelsen
  // fortsette mens den skrivelåsen står. Uten WAL svarer lesinger SQLITE_BUSY
  // midt i en skriving. Journal-modus er en varig egenskap ved fila.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const current = versionRow?.user_version ?? 0;
  if (current < 1) {
    await db.execAsync(MIGRATION_V1);
    // PRAGMA tar ikke bind-parametre; SCHEMA_VERSION er en tallkonstant i denne
    // fila, aldri brukerdata.
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
  return db;
}

/** Én delt forbindelse for hele appen; åpnes og migreres ved første kall. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err: unknown) => {
      // Ikke la en feilet åpning bli permanent — neste kall skal få prøve igjen.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Serialiserende kø for transaksjoner.
 *
 * `withExclusiveTransactionAsync` åpner en ny forbindelse og kjører `BEGIN` —
 * to overlappende kall ville kollidert med «database is locked». expo-sqlite
 * serialiserer dem ikke selv, så vi gjør det her: alt som skriver går gjennom
 * `withTxn`, og køen garanterer at bare én transaksjon er åpen om gangen.
 * Kjeden holdes i live også når en oppgave kaster.
 */
let txnChain: Promise<unknown> = Promise.resolve();

export function withTxn<T>(
  task: (txn: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const run = txnChain.then(async () => {
    const db = await getDb();
    let result!: T;
    await db.withExclusiveTransactionAsync(async (txn) => {
      result = await task(txn);
    });
    return result;
  });
  txnChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

// ---------------------------------------------------------------------------
// Rå rad-fasonger + mapping. Ingen annen fil rører snake_case.
// ---------------------------------------------------------------------------

interface ScoreRow {
  id: string;
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  entered_by: string;
  client_updated_at: string;
  server_updated_at: string | null;
}

interface QueueRow {
  id: string;
  score_id: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  abandoned_at: string | null;
}

interface ConflictRow {
  id: string;
  game_id: string;
  user_id: string;
  hole_number: number;
  local_strokes: number | null;
  server_strokes: number | null;
  resolved_at: string;
  for_own_score: number | null;
}

function toLocalScore(row: ScoreRow): LocalScore {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    holeNumber: row.hole_number,
    strokes: row.strokes,
    putts: row.putts,
    enteredBy: row.entered_by,
    clientUpdatedAt: row.client_updated_at,
    serverUpdatedAt: row.server_updated_at,
  };
}

function toQueueItem(row: QueueRow): SyncQueueItem {
  return {
    id: row.id,
    scoreId: row.score_id,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    abandonedAt: row.abandoned_at,
  };
}

function toConflictRecord(row: ConflictRow): ConflictRecord {
  return {
    id: row.id,
    gameId: row.game_id,
    userId: row.user_id,
    holeNumber: row.hole_number,
    localStrokes: row.local_strokes,
    serverStrokes: row.server_strokes,
    resolvedAt: row.resolved_at,
    // SQLite har ingen boolean-type: 0/1, og NULL for rader skrevet før feltet
    // fantes (samme «undefined»-semantikk som webbens Dexie-rader).
    forOwnScore: row.for_own_score == null ? undefined : row.for_own_score === 1,
  };
}

// ---------------------------------------------------------------------------
// Aksessorer. Alle tar en `SQLiteDatabase` slik at de virker både på den delte
// forbindelsen og på et `withTxn`-transaksjonsobjekt (som arver den).
// ---------------------------------------------------------------------------

export async function getScore(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<LocalScore | undefined> {
  const row = await db.getFirstAsync<ScoreRow>(
    'SELECT * FROM scores WHERE id = $id;',
    { $id: id },
  );
  return row ? toLocalScore(row) : undefined;
}

export async function putScore(
  db: SQLite.SQLiteDatabase,
  score: LocalScore,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO scores
       (id, game_id, user_id, hole_number, strokes, putts, entered_by, client_updated_at, server_updated_at)
     VALUES
       ($id, $game_id, $user_id, $hole_number, $strokes, $putts, $entered_by, $client_updated_at, $server_updated_at);`,
    {
      $id: score.id,
      $game_id: score.gameId,
      $user_id: score.userId,
      $hole_number: score.holeNumber,
      $strokes: score.strokes,
      $putts: score.putts,
      $entered_by: score.enteredBy,
      $client_updated_at: score.clientUpdatedAt,
      $server_updated_at: score.serverUpdatedAt,
    },
  );
}

export async function listScoresForGame(
  db: SQLite.SQLiteDatabase,
  gameId: string,
): Promise<LocalScore[]> {
  const rows = await db.getAllAsync<ScoreRow>(
    'SELECT * FROM scores WHERE game_id = $game_id ORDER BY hole_number;',
    { $game_id: gameId },
  );
  return rows.map(toLocalScore);
}

/**
 * Hele køen i `createdAt`-rekkefølge — samme rekkefølge som webbens
 * `syncQueue.orderBy('createdAt')`. Køen er global (ett kø-rom for alle spill),
 * akkurat som på web; `queueScope.isActiveForGame` er filteret når en flate
 * bare skal rapportere for ett spill (#1370).
 */
export async function listQueue(
  db: SQLite.SQLiteDatabase,
): Promise<SyncQueueItem[]> {
  const rows = await db.getAllAsync<QueueRow>(
    'SELECT * FROM sync_queue ORDER BY created_at;',
  );
  return rows.map(toQueueItem);
}

export async function putQueueItem(
  db: SQLite.SQLiteDatabase,
  item: SyncQueueItem,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue
       (id, score_id, attempt_count, last_error, created_at, abandoned_at)
     VALUES
       ($id, $score_id, $attempt_count, $last_error, $created_at, $abandoned_at);`,
    {
      $id: item.id,
      $score_id: item.scoreId,
      $attempt_count: item.attemptCount,
      $last_error: item.lastError,
      $created_at: item.createdAt,
      $abandoned_at: item.abandonedAt ?? null,
    },
  );
}

export async function deleteQueueItem(
  db: SQLite.SQLiteDatabase,
  id: string,
): Promise<void> {
  await db.runAsync('DELETE FROM sync_queue WHERE id = $id;', { $id: id });
}

/** Et forsøk til på et element som fortsatt skal prøves på nytt. */
export async function markQueueRetry(
  db: SQLite.SQLiteDatabase,
  id: string,
  patch: { attemptCount: number; lastError: string | null },
): Promise<void> {
  await db.runAsync(
    'UPDATE sync_queue SET attempt_count = $attempt_count, last_error = $last_error WHERE id = $id;',
    {
      $id: id,
      $attempt_count: patch.attemptCount,
      $last_error: patch.lastError,
    },
  );
}

/**
 * Karantene (#668): elementet gis opp og hoppes over av hver senere drain.
 * Raden blir stående som spor av feilen — den slettes aldri stille.
 */
export async function markQueueAbandoned(
  db: SQLite.SQLiteDatabase,
  id: string,
  patch: { attemptCount: number; lastError: string | null; abandonedAt: string },
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_queue
        SET attempt_count = $attempt_count, last_error = $last_error, abandoned_at = $abandoned_at
      WHERE id = $id;`,
    {
      $id: id,
      $attempt_count: patch.attemptCount,
      $last_error: patch.lastError,
      $abandoned_at: patch.abandonedAt,
    },
  );
}

export async function putConflict(
  db: SQLite.SQLiteDatabase,
  record: ConflictRecord,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO conflicts
       (id, game_id, user_id, hole_number, local_strokes, server_strokes, resolved_at, for_own_score)
     VALUES
       ($id, $game_id, $user_id, $hole_number, $local_strokes, $server_strokes, $resolved_at, $for_own_score);`,
    {
      $id: record.id,
      $game_id: record.gameId,
      $user_id: record.userId,
      $hole_number: record.holeNumber,
      $local_strokes: record.localStrokes,
      $server_strokes: record.serverStrokes,
      $resolved_at: record.resolvedAt,
      $for_own_score:
        record.forOwnScore == null ? null : record.forOwnScore ? 1 : 0,
    },
  );
}

export async function listConflictsForGame(
  db: SQLite.SQLiteDatabase,
  gameId: string,
): Promise<ConflictRecord[]> {
  const rows = await db.getAllAsync<ConflictRow>(
    'SELECT * FROM conflicts WHERE game_id = $game_id ORDER BY resolved_at DESC;',
    { $game_id: gameId },
  );
  return rows.map(toConflictRecord);
}
