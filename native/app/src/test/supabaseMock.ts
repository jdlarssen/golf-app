// Native N3 (#1825): stand-in for `src/supabase.ts` i testene.
//
// Den ekte modulen kaster uten `EXPO_PUBLIC_SUPABASE_*` og kobler seg på
// `AppState` ved import, så hver suite som drar inn datalaget mocker den:
//
//   jest.mock('../supabase', () => require('../test/supabaseMock'));
//
// Tilstanden ligger på modulnivå, så etter `jest.resetModules()` må testen
// hente den på nytt med `await import('../test/supabaseMock')` — da er det den
// samme instansen koden under test skriver mot.

export interface StubResult {
  data: unknown;
  error: { message: string } | null;
}

export interface RecordedStep {
  method: string;
  args: unknown[];
}

/**
 * En PostgREST-lignende builder: alt kjeder, og await-en gir `result`.
 * `steps` er kvitteringen — testene asserter på filtrene og patchen som ble
 * sendt (at `submitted_at IS NULL`-filteret faktisk står der ER kontrakten).
 */
export interface QueryStub extends PromiseLike<StubResult> {
  steps: RecordedStep[];
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'upsert',
  'delete',
  'eq',
  'neq',
  'is',
  'not',
  'in',
  'lte',
  'gte',
  'order',
  'limit',
  'returns',
  'single',
  'maybeSingle',
] as const;

export function queryStub(result: StubResult): QueryStub {
  const steps: RecordedStep[] = [];
  const stub: Record<string, unknown> = {
    steps,
    then: (
      onFulfilled?: ((value: StubResult) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  for (const method of CHAIN_METHODS) {
    stub[method] = (...args: unknown[]) => {
      steps.push({ method, args });
      return stub;
    };
  }
  return stub as unknown as QueryStub;
}

/** Finn argumentene et bestemt kjede-ledd ble kalt med. */
export function stepArgs(stub: QueryStub, method: string): unknown[][] {
  return stub.steps.filter((s) => s.method === method).map((s) => s.args);
}

/**
 * Ruter `supabase.from(table)` til forhåndsriggede svar, ett per kall i
 * rekkefølge. En spørring ingen har rigget kaster — en handling som fyrer en
 * uventet DB-runde skal falle med en tydelig melding, ikke gå videre på
 * `undefined`.
 */
export function routeFrom(plan: Record<string, QueryStub[]>): void {
  const remaining = new Map<string, QueryStub[]>(
    Object.entries(plan).map(([table, stubs]) => [table, [...stubs]]),
  );
  supabase.from.mockImplementation((table: string) => {
    const next = remaining.get(table)?.shift();
    if (!next) {
      throw new Error(`supabaseMock: uventet spørring mot «${table}»`);
    }
    return next;
  });
}

export const supabase: {
  rpc: jest.Mock;
  from: jest.Mock;
} = {
  rpc: jest.fn(),
  from: jest.fn(),
};

export const currentDeviceUserId: jest.Mock<Promise<string | null>, []> =
  jest.fn(async () => null);
