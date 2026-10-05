/**
 * A recording stand-in for a Supabase client at the PostgREST boundary
 * (#2493). `client.from(table)` starts a query; every chained call
 * (`select`, `in`, `eq`, `gte`, `order`, `limit`, …) is logged on that query
 * as `[method, ...args]` and returns the same builder; awaiting the builder
 * resolves `respond(calls)` — fixed rows, or rows the test computes from the
 * recorded filters.
 *
 * Use it from a `vi.mock` factory through a module-level variable, read
 * lazily, so the factory never touches it before it exists:
 *
 *   const db = recordingClient(() => ({ data: rows, error: null }));
 *   vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => db.client }));
 *
 * PostgREST does not care in which order filters come, so assert on which
 * calls a query has, not on their order.
 */
export type QueryCall = [string, ...unknown[]];

export type QueryResult = { data: unknown; error: unknown };

export function recordingClient(respond: (calls: QueryCall[]) => QueryResult) {
  const queries: QueryCall[][] = [];

  function builder(calls: QueryCall[]): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve()
                .then(() => respond(calls))
                .then(resolve, reject);
          }
          return (...args: unknown[]) => {
            calls.push([String(prop), ...args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  return {
    client: {
      from: (table: string) => {
        const calls: QueryCall[] = [['from', table]];
        queries.push(calls);
        return builder(calls);
      },
    },
    /** One entry per query, in the order they were started. */
    queries,
    /** Every call of every query, flattened. */
    calls: () => queries.flat(),
    reset: () => {
      queries.length = 0;
    },
  };
}
