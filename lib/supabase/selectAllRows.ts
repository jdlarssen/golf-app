/**
 * Read every row of a query that can outgrow PostgREST's «Max rows» cap.
 *
 * Motivating bug: #1894 / #2050 — PostgREST cuts a response at the project's
 * max-rows setting (measured 1 000 on staging: `content-range 0-999/1897`) and
 * says nothing. `data` is just shorter. A 150-player game has ~2 700 score rows,
 * so an unpaged read quietly drops holes from leaderboards, reminders and mail.
 *
 * Usage — the factory MUST order on a unique column, otherwise rows can repeat
 * or go missing between pages:
 *
 *   const scores = await selectAllRows(
 *     (from, to) =>
 *       supabase
 *         .from('scores')
 *         .select(SCORES_SELECT)
 *         .eq('game_id', gameId)
 *         .order('id')
 *         .range(from, to)
 *         .returns<ScoreRow[]>(),
 *     'loadScores',
 *   )
 *
 * Deliberately dependency-free: the browser (RealtimeMount) and the native app
 * import it too, and Metro resolves bare imports from the requiring file.
 */

/**
 * Rows per request. Must not exceed the server's max-rows cap: a page the server
 * shortened would read as the last page. Both are 1 000 today.
 */
export const PAGE_SIZE = 1000;

/** Guard against a factory that ignores `range` and returns full pages forever. */
export const MAX_PAGES = 50;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Reads page after page until one comes back short. Throws on any page error. */
export async function selectAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let n = 0; n < MAX_PAGES; n++) {
    const from = n * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${context}: page ${n + 1} failed: ${error.message}`, { cause: error });
    }
    const pageRows = data ?? [];
    rows.push(...pageRows);
    // A full page is not proof of more rows, so exactly 1 000 costs one empty page.
    if (pageRows.length < PAGE_SIZE) return rows;
  }
  throw new Error(`${context}: more than ${MAX_PAGES} pages (${MAX_PAGES * PAGE_SIZE} rows)`);
}

/**
 * Same read, shaped like a PostgREST response, for call sites that sit in a
 * `Promise.all` and handle `{ data, error }` themselves.
 */
export async function selectAllRowsResult<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  context: string,
): Promise<{ data: T[]; error: null } | { data: null; error: unknown }> {
  try {
    return { data: await selectAllRows(page, context), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
