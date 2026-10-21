// native/app/src/data/timedFetch.ts
// #1954 D2: ett tidstak for alle nettkall appen gjør.
//
// **Hvorfor.** Ingen ledd under appen har en grense. I RN 0.86 setter
// `OkHttpClientProvider` connect-, read- og write-timeout til 0 på Android,
// altså ingen grense, og på iOS er `timeoutInterval` 0 (trolig systemets 60 s).
// På svak dekning kan en forespørsel derfor henge for alltid. Det rammet alt som
// venter på et svar: sync-køen holdt låsen sin og «Lever scorekort» sto på
// «Synker slag …», og Lever, Godkjenn, Avslutt runden, Trekk meg, Start,
// innloggingen og første visning av en skjerm uten lagret kopi sto og ventet.
//
// **Ett hjem.** Taket kobles inn to steder, og bare der:
// `createClient(..., { global: { fetch: timedFetch } })` i `supabase.ts` (alle
// PostgREST-, RPC- og auth-kall) og `send()` i `webApi.ts` (rutene på
// nettsiden). Ingen skjerm har sitt eget tak for et enkelt kall.
//
// **Feilen.** Når taket nås, avviser kallet med
// `TypeError('Network request failed (timeout)')`, samme form som RNs gamle
// XHR-fetch ga uten nett. Da leser alle tre klassifisererne det som nett uten å
// vite om taket: `isNetworkFailureMessage` under (innloggingen og sync-køen),
// `lib/sync/classifyError` (prøv igjen, aldri karantene) og catch-en i
// `webApi.send()` ('network').
//
// **Kallerens eget signal** slås sammen med taket for hånd, ikke med
// `AbortSignal.any`: da kan kallet skille de to. Avbryter kalleren, avvises det
// med en `AbortError`, ikke med tidsavbruddet. postgrest prøver ikke en avbrutt
// GET på nytt, og spillhentingen (`useGameData`, 12 s) skiller selv sitt eget
// tak fra et nettbrudd.
//
// **Kroppen er med under taket.** Appens fetch er expo/fetch
// (`expo/src/winter/runtime.native.ts`). Den løser når headerne er kommet, og
// kroppen leses etterpå (postgrest `res.text()`, auth-js `json()`,
// `webApi.readBody`), med OkHttps lesetak på 0. Dør nettet etter headerne, ville
// lesingen ventet for alltid. Derfor leses kroppen ferdig her, under samme
// frist, og kalleren får en `Response` med kroppen i minnet.
//
// **Hva taket ikke dekker.**
// - postgrest-js prøver en GET som feiler med nettfeil, tre ganger til med
//   1 + 2 + 4 s pause. En lesing som henger hver gang, gir derfor opp etter
//   rundt 4 × 15 + 7 s. Skrivinger (POST/PATCH, RPC) prøves aldri på nytt av
//   biblioteket, så de er bundet til ett tak.
// - Øktfornyelsen i auth-js har sitt eget budsjett på 30 s for nye forsøk
//   (`AUTO_REFRESH_TICK_DURATION_MS`). Hvert forsøk er bundet av taket her, og
//   budsjettet godtas som det er.

/**
 * Taket per forespørsel. Over spillhentingens 12 s (`GAME_BUNDLE_TIMEOUT_MS`),
 * så den beholder sin egen melding, og godt over det et svar tar på normal
 * 4G. ASSUMPTION fra kontrakten (#1954 D2): 15 s.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Meldingen et kall som nådde taket, avvises med. Inneholder «network request failed». */
export const TIMEOUT_MESSAGE = 'Network request failed (timeout)';

/**
 * Bitene en nettfeil kan stå med, uansett plattform: taket over og RNs gamle
 * XHR-fetch (`Network request failed`), expo/fetch (`fetch failed: …`, for
 * eksempel `fetch failed: java.net.UnknownHostException …`), Chrome (`Failed to
 * fetch`) og Safari (`Load failed`). Én liste, delt av innloggingen og
 * sync-køen.
 */
const NETWORK_HINTS = ['network request failed', 'failed to fetch', 'load failed', 'fetch failed'];

/**
 * True når feilmeldingen betyr at forespørselen aldri fikk svar, altså nettet
 * og ikke serveren. Matcher også supabase-js sin form (`TypeError: Network
 * request failed`, `Error: fetch failed: …`).
 */
export function isNetworkFailureMessage(message: string | null | undefined): boolean {
  const lower = (message ?? '').toLowerCase();
  return NETWORK_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Koden en feilet handling skal ha når feilen egentlig er nettet (#1954 D2).
 *
 * Datalagene oversetter en feil fra PostgREST til sin egen generelle kode
 * ('db'), og da sa skjermen «Noe gikk galt mot serveren» også når forespørselen
 * aldri kom fram. Er den rå teksten en nettfeil, blir koden 'offline' i stedet,
 * og skjermen viser den felles nett-linja (`OFFLINE_NOTE`).
 */
export function unlessNetwork<R extends string>(reason: R, message: string | undefined): R | 'offline' {
  return isNetworkFailureMessage(message) ? 'offline' : reason;
}

/** Statusene en `Response` ikke kan ha kropp med. */
const NULL_BODY_STATUSES = new Set([204, 205, 304]);

/** Svaret med kroppen lest inn i minnet, så ingen lesing etterpå venter på nettet. */
async function withBufferedBody(response: Response): Promise<Response> {
  const init = { status: response.status, statusText: response.statusText, headers: response.headers };
  if (NULL_BODY_STATUSES.has(response.status)) return new Response(null, init);
  return new Response(await response.arrayBuffer(), init);
}

/** En `AbortError` slik fetch gir den. `DOMException` finnes ikke i alle RN-versjoner. */
function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * `fetch` med {@link REQUEST_TIMEOUT_MS} som tak.
 *
 * Avviser selv når taket nås, også om fetch-en under aldri reagerer på
 * signalet, og avbryter forespørselen under. Taket gjelder til kroppen er lest
 * (se fil-kommentaren). `globalThis.fetch` leses ved hvert
 * kall, ikke ved import, slik at testene kan bytte den.
 */
export function timedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const outer = init.signal ?? undefined;
  if (outer?.aborted) return Promise.reject(abortError());

  const controller = new AbortController();
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
      finish();
    };
    const onOuterAbort = () => {
      controller.abort();
      settle(() => reject(abortError()));
    };
    const timer = setTimeout(() => {
      controller.abort();
      settle(() => reject(new TypeError(TIMEOUT_MESSAGE)));
    }, REQUEST_TIMEOUT_MS);
    outer?.addEventListener('abort', onOuterAbort);

    globalThis.fetch(input, { ...init, signal: controller.signal })
      .then(withBufferedBody)
      .then(
        (response) => settle(() => resolve(response)),
        (err: unknown) => settle(() => reject(err)),
      );
  });
}
