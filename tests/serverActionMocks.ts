import { vi } from 'vitest';

/**
 * Shared mock helpers for server-action unit tests.
 *
 * Each test file calls `vi.mock(...)` for the modules it needs to fake;
 * those mocks delegate to the spies / factories exported here so tests
 * can read call history per-test via `vi.clearAllMocks()` between cases.
 *
 * Why not a vitest setupFile? Server actions are imported via dynamic
 * `await import('./actions')` inside each test so the `vi.mock` hoist
 * applies — keeping the mocks colocated with their use lets each file
 * stay self-contained without relying on global setup ordering.
 */

// Marker error thrown in place of Next.js's internal NEXT_REDIRECT signal.
// Real Next.js throws this from `redirect()` so callers never run code past
// the redirect call — mirroring the behaviour here keeps the test honest.
export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
    this.name = 'RedirectError';
  }
}

/** Build a `redirect` spy that throws RedirectError on every call. */
export function makeRedirectMock() {
  return vi.fn((url: string) => {
    throw new RedirectError(url);
  });
}

export type QueryResult = { data?: unknown; error?: unknown };

/**
 * Build a fake Supabase server-client that resolves queries from a FIFO
 * `queue` of pre-canned results.
 *
 * Each terminal call (`single`, `maybeSingle`, `returns`, an awaited
 * `update`/`insert`/`upsert` chain) pops the next entry off `queue`.
 *
 * Chainable filter methods (`select`, `eq`, `is`, `not`, `in`) return
 * the same builder so any chain length works without per-test config.
 *
 * Inspect calls via `client.__fromCalls` (FIFO list of `{table, method, args}`).
 */
export function buildSupabaseMock(queue: QueryResult[]) {
  const fromCalls: Array<{
    table: string;
    method: string;
    args: unknown[];
  }> = [];

  let currentTable = '';

  const next = (): QueryResult => queue.shift() ?? { data: null, error: null };

  function rec(method: string, args: unknown[]) {
    fromCalls.push({ table: currentTable, method, args });
  }

  /**
   * Build a builder proxy where every chained method returns `proxy` AND
   * `proxy` itself is thenable. This means a chain can terminate at ANY
   * link via `await` (which is how Supabase's query-builder behaves):
   *
   *   await supabase.from('x').select('y').eq('id', 1)
   *   await supabase.from('x').update({y: 1}).eq('id', 1)
   *   await supabase.from('x').select(...).eq(...).single()
   *
   * Resolution is lazy: the next queue entry is only popped when `.then`
   * is invoked or a terminal (`single`/`maybeSingle`/`returns`) is called.
   */
  function makeBuilder() {
    let resolved: QueryResult | null = null;
    const proxy: Record<string, unknown> = {};

    // Chainable + lazily-resolvable filters. `order` + `limit` brukes av
    // helpers som henter sortert/begrenset data — de er rene pass-through-er
    // i mock-en (vi sjekker ikke sortering i unit-tests, kun resultatet).
    for (const m of ['select', 'eq', 'is', 'not', 'in', 'order', 'limit']) {
      proxy[m] = (...args: unknown[]) => {
        rec(m, args);
        return proxy;
      };
    }

    // Explicit terminal resolvers — these forcibly pop the next result.
    proxy.single = (...args: unknown[]) => {
      rec('single', args);
      return Promise.resolve(next());
    };
    proxy.maybeSingle = (...args: unknown[]) => {
      rec('maybeSingle', args);
      return Promise.resolve(next());
    };
    proxy.returns = (...args: unknown[]) => {
      rec('returns', args);
      return Promise.resolve(next());
    };

    // Mutations always return the same thenable builder so a chain like
    // .update({...}).eq(...).is(...) resolves whenever it's awaited.
    proxy.update = (...args: unknown[]) => {
      rec('update', args);
      return proxy;
    };
    proxy.insert = (...args: unknown[]) => {
      rec('insert', args);
      return proxy;
    };
    proxy.upsert = (...args: unknown[]) => {
      rec('upsert', args);
      return proxy;
    };
    proxy.delete = (...args: unknown[]) => {
      rec('delete', args);
      return proxy;
    };

    // Thenable so the builder itself can be `await`ed. Real Supabase does
    // the same — its query-builder is a PromiseLike that triggers the
    // request when awaited.
    proxy.then = (
      onFulfilled?: (v: QueryResult) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      if (resolved === null) resolved = next();
      return Promise.resolve(resolved).then(onFulfilled, onRejected);
    };

    return proxy;
  }

  return {
    auth: { getUser: vi.fn() },
    from: vi.fn((table: string) => {
      currentTable = table;
      // Fresh builder per `from()` so each chain has its own thenable cache
      // (avoids one query's resolution accidentally satisfying the next).
      return makeBuilder();
    }),
    __fromCalls: fromCalls,
  };
}
