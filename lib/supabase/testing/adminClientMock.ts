/**
 * Testdobbel for `getAdminClient()` — service-role-klienten.
 *
 * Modulene bak app→server-rutene (#1891) snakker med Supabase gjennom
 * PostgREST-kjeden (`.from().select().eq()…`) og med GoTrue
 * (`auth.getUser(token)`). Å håndskrive den kjeden på nytt i hver testfil er
 * nøyaktig det test-disiplinen kaller kopier-lim av mock-oppsett;
 * `lib/sync/testing/fakeDb.ts` er presedensen for å legge dobbelen ved siden av
 * modulen den dobler.
 *
 * Dobbelen REGISTRERER i stedet for å simulere: den forstår ikke filtre, den
 * skriver dem ned. Testen svarer selv via `respond` og asserterer så på `ops` —
 * hvilken tabell, hvilke kolonner, hvilke filtre, hvilken payload. Det gjør
 * negativt bevis billig («ingen skriving skjedde»), som er hele poenget i en
 * auth-flate.
 *
 * Ingen vitest-import: rene closures, så dobbelen kan brukes fra hvilken som
 * helst runner — og fra en `vi.mock`-fabrikk uten hoisting-fella.
 *
 * ```ts
 * const fake = createAdminClientMock({ tokens: { gyldig: 'user-1' }, respond });
 * // NB: `() => fake.client`, ikke `fake.client` — fabrikken kjører før
 * // `const fake` er initialisert hvis den dereferer den med én gang.
 * vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => fake.client }));
 * ```
 */

/** Ett registrert filter-ledd. `not('strokes','is',null)` blir op `'not'`. */
export type QueryFilter = {
  op: 'eq' | 'in' | 'is' | 'not';
  column: string;
  value: unknown;
};

/** Én registrert spørring — alt kjeden rakk å fortelle før den ble ventet på. */
export type QueryOp = {
  table: string;
  kind: 'select' | 'update' | 'insert' | 'delete';
  /** Kolonne-strengen som ble bedt om, eller `null` for en kjede uten select. */
  columns: string | null;
  /** Raden som ble skrevet, eller `null` for lesing. */
  payload: Record<string, unknown> | null;
  filters: QueryFilter[];
  /** `true` når kjeden endte i `.single()`/`.maybeSingle()`. */
  single: boolean;
};

/** Svaret `respond` gir. Utelatt `error` betyr «gikk bra». */
export type QueryResponse = {
  data?: unknown;
  error?: { message: string } | null;
};

/**
 * PostgREST-kjeden. Hvert ledd returnerer seg selv og noterer seg; `await`
 * spør `respond`. Bevisst utypet i data-enden: produksjonskoden gir
 * `.maybeSingle<T>()`/`.returns<T[]>()` sine type-argumenter mot den EKTE
 * klienten, og de forsvinner ved kompilering — dobbelen trenger bare å godta
 * kallene.
 */
export interface QueryChain extends PromiseLike<QueryResponse> {
  select(columns?: string): QueryChain;
  eq(column: string, value: unknown): QueryChain;
  in(column: string, value: unknown): QueryChain;
  is(column: string, value: unknown): QueryChain;
  not(column: string, operator: string, value: unknown): QueryChain;
  returns(): QueryChain;
  single(): QueryChain;
  maybeSingle(): QueryChain;
}

export interface AdminClientMock {
  /** Returverdien `vi.mock` skal la `getAdminClient()` gi. */
  client: {
    auth: {
      getUser(jwt: string): Promise<{
        data: { user: { id: string } | null };
        error: { message: string } | null;
      }>;
    };
    from(table: string): {
      select(columns?: string): QueryChain;
      update(payload: Record<string, unknown>): QueryChain;
      insert(payload: Record<string, unknown>): QueryChain;
      delete(): QueryChain;
    };
  };
  /** Hver spørring som ble ventet på, i rekkefølge. Tom = DB-en ble aldri rørt. */
  ops: QueryOp[];
  /** Hvert token som faktisk ble sendt til GoTrue. Tom = ingen rundtur. */
  getUserCalls: string[];
  /** Nullstill registrene mellom testene (svar-funksjonen beholdes). */
  reset(): void;
}

export function createAdminClientMock(opts: {
  /**
   * Token → bruker-id. Alt annet avvises nøyaktig som GoTrue gjør det:
   * `{ data: { user: null }, error }`.
   */
  tokens?: Record<string, string>;
  /**
   * Svaret på én spørring. Kaster `respond`, kaster kjeden — slik en ekte
   * nettverks- eller konfigurasjonsfeil ville gjort.
   */
  respond: (op: QueryOp) => QueryResponse;
}): AdminClientMock {
  const { tokens = {}, respond } = opts;
  const ops: QueryOp[] = [];
  const getUserCalls: string[] = [];

  function chain(
    table: string,
    kind: QueryOp['kind'],
    payload: Record<string, unknown> | null,
    columns: string | null,
  ): QueryChain {
    const op: QueryOp = {
      table,
      kind,
      columns,
      payload,
      filters: [],
      single: false,
    };
    const push = (filterOp: QueryFilter['op'], column: string, value: unknown) => {
      op.filters.push({ op: filterOp, column, value });
      return api;
    };
    const api: QueryChain = {
      select: (cols?: string) => {
        // `.select()` er både et ledd (etter `from`) og terminalen på en
        // update. Kolonnene fra det FØRSTE kallet er de interessante.
        op.columns ??= cols ?? null;
        return api;
      },
      eq: (column, value) => push('eq', column, value),
      in: (column, value) => push('in', column, value),
      is: (column, value) => push('is', column, value),
      not: (column, _operator, value) => push('not', column, value),
      returns: () => api,
      single: () => {
        op.single = true;
        return api;
      },
      maybeSingle: () => {
        op.single = true;
        return api;
      },
      then: (onfulfilled, onrejected) => {
        // Registreres først når noen faktisk venter på kjeden: en kjede som
        // bygges og forkastes har ikke rørt databasen.
        ops.push(op);
        return Promise.resolve()
          .then(() => ({ error: null, ...respond(op) }))
          .then(onfulfilled, onrejected);
      },
    };
    return api;
  }

  return {
    client: {
      auth: {
        getUser: (jwt: string) => {
          getUserCalls.push(jwt);
          const userId = tokens[jwt];
          return Promise.resolve(
            userId
              ? { data: { user: { id: userId } }, error: null }
              : { data: { user: null }, error: { message: 'invalid JWT' } },
          );
        },
      },
      from: (table: string) => ({
        select: (columns?: string) => chain(table, 'select', null, columns ?? null),
        update: (payload: Record<string, unknown>) =>
          chain(table, 'update', payload, null),
        insert: (payload: Record<string, unknown>) =>
          chain(table, 'insert', payload, null),
        delete: () => chain(table, 'delete', null, null),
      }),
    },
    ops,
    getUserCalls,
    reset() {
      ops.length = 0;
      getUserCalls.length = 0;
    },
  };
}
