// native/app/src/data/timedFetch.test.ts
// #1954 D2: tidstaket alle nettkall i appen går gjennom.
//
// Ingen ledd under appen har en grense (OkHttp på Android venter uten tak), så
// en forespørsel som henger, hang for alltid. Testene låser de fire tingene
// taket lover: et hengende kall avviser etter taket med en feil alle tre
// klassifisererne leser som nett, kallerens eget signal virker fortsatt, et
// svar før taket slipper gjennom urørt, og en nettfeil fra under kommer ut som
// den var.
import {
  REQUEST_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  isNetworkFailureMessage,
  timedFetch,
} from './timedFetch';

const URL = 'https://staging.example/rest/v1/rpc/upsert_score_if_newer';

describe('timedFetch', () => {
  const originalFetch = global.fetch;
  let underlying: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    underlying = jest.fn();
    global.fetch = underlying as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  /** Et kall som aldri svarer og heller ikke bryr seg om signalet, som OkHttp uten tak. */
  function hang(): void {
    underlying.mockImplementation(() => new Promise(() => {}));
  }

  it('et hengende kall avviser etter taket med en nett-feil', async () => {
    hang();
    const call = timedFetch(URL, { method: 'POST' });
    const outcome = call.then(
      () => 'resolved',
      (err: unknown) => err,
    );

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    // Fortsatt i lufta like før taket.
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toBeInstanceOf(TypeError);
    expect((err as TypeError).message).toBe(TIMEOUT_MESSAGE);
    expect(isNetworkFailureMessage((err as TypeError).message)).toBe(true);
  });

  it('avbryter forespørselen under når taket nås', async () => {
    hang();
    const call = timedFetch(URL).catch(() => undefined);
    const init = underlying.mock.calls[0]![1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await call;
    expect(init.signal?.aborted).toBe(true);
  });

  it('kallerens eget signal virker fortsatt, før taket', async () => {
    hang();
    const caller = new AbortController();
    const outcome = timedFetch(URL, { signal: caller.signal }).then(
      () => 'resolved',
      (err: unknown) => err,
    );

    await jest.advanceTimersByTimeAsync(12_000);
    caller.abort();
    const err = await outcome;
    // AbortError, ikke tidsavbrudd: postgrest prøver ikke en avbrutt GET på
    // nytt, og spillhentingen skiller selv sitt eget tak fra et nettbrudd.
    expect((err as Error).name).toBe('AbortError');
    const init = underlying.mock.calls[0]![1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('et signal som alt er avbrutt, sender ingenting', async () => {
    const caller = new AbortController();
    caller.abort();
    await expect(timedFetch(URL, { signal: caller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(underlying).not.toHaveBeenCalled();
  });

  it('et svar før taket slipper gjennom, og taket fyrer ikke etterpå', async () => {
    underlying.mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(timedFetch(URL)).resolves.toMatchObject({ status: 200 });
    expect(jest.getTimerCount()).toBe(0);
  });

  // Gjennomgangen av #2622: appens fetch er expo/fetch, som løser når headerne
  // er kommet. Kroppen leses etterpå (postgrest `res.text()`, auth-js
  // `json()`), og dør nettet da, ventet lesingen uten grense. Taket gjelder
  // derfor til kroppen er lest.
  it('en kropp som aldri blir ferdig lest, avviser også ved taket', async () => {
    underlying.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: () => new Promise(() => {}),
      arrayBuffer: () => new Promise(() => {}),
    });
    const outcome = timedFetch(URL).then(
      () => 'resolved',
      (err: unknown) => err,
    );

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const err = await outcome;
    expect(err).toBeInstanceOf(TypeError);
    expect((err as TypeError).message).toBe(TIMEOUT_MESSAGE);
    const init = underlying.mock.calls[0]![1] as RequestInit;
    expect(init.signal?.aborted).toBe(true);
  });

  it('svaret kommer tilbake med kroppen lest, status og headere urørt', async () => {
    underlying.mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }]), {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' },
      }),
    );
    const response = await timedFetch(URL);
    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('content-range')).toBe('0-0/1');
    expect(await response.json()).toEqual([{ id: 1 }]);
    expect(jest.getTimerCount()).toBe(0);
  });

  // Evaluator runde 2: i appen er `Response` RN sin whatwg-fetch-polyfill (ikke
  // Nodes), og den leser en ArrayBuffer-kropp som Latin-1. Da ble «ø» til «Ã¸» i
  // hvert svar. Testen bruker polyfillens egen `Response`, slik telefonen gjør.
  it('æ, ø og å kommer gjennom med RN sin egen Response', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- pakken har ingen typer; bare Response trengs
    const { Response: RnResponse } = require('whatwg-fetch') as { Response: typeof Response };
    const nodeResponse = global.Response;
    global.Response = RnResponse;
    try {
      const json = JSON.stringify({ name: 'Kari Arrangør', course: 'Bærum Å' });
      // expo/fetch sitt svar: både tekst og bytes (UTF-8) kan leses.
      const bytes = new TextEncoder().encode(json);
      underlying.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new RnResponse('').headers,
        text: async () => json,
        arrayBuffer: async () => bytes.buffer,
      });
      const response = await timedFetch(URL);
      expect(await response.json()).toEqual({ name: 'Kari Arrangør', course: 'Bærum Å' });
    } finally {
      global.Response = nodeResponse;
    }
  });

  it.each([204, 205, 304])('status %i uten kropp går gjennom', async (status) => {
    underlying.mockResolvedValue(new Response(null, { status }));
    const response = await timedFetch(URL);
    expect(response.status).toBe(status);
    expect(await response.text()).toBe('');
  });

  it('en nettfeil fra under kommer ut som den var', async () => {
    const offline = new TypeError('Network request failed');
    underlying.mockRejectedValue(offline);

    await expect(timedFetch(URL)).rejects.toBe(offline);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('isNetworkFailureMessage', () => {
  it.each([
    ['TypeError: Network request failed', true],
    [`TypeError: ${TIMEOUT_MESSAGE}`, true],
    ['Failed to fetch', true],
    ['Load failed', true],
    // expo/fetch (`FetchError`), slik supabase-js og webApi ser den.
    ['Error: fetch failed: java.net.UnknownHostException: Unable to resolve host "staging.example"', true],
    ['fetch failed: The Internet connection appears to be offline.', true],
    ['new row violates row-level security policy', false],
    ['JWT expired', false],
    ['', false],
  ])('%j → %s', (message, expected) => {
    expect(isNetworkFailureMessage(message)).toBe(expected);
  });
});
