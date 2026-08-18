/**
 * #1581: la Playwright-nettleseren speile Node sitt utgående nett.
 *
 * I nattkjørerens VM går utgående HTTPS gjennom en agent-proxy med privat CA.
 * Node arver det oppsettet (30 av 31 @gate-specer grønne), men Chromium gjør det
 * ikke — og `e2e/games/scoring-golden-path.spec.ts` er den ENESTE @gate-specen hvis
 * pass-betingelse avhenger av en request rett fra nettleser-konteksten til
 * staging-Supabase (`lib/sync/syncWorker.ts` upserter slag fra browseren). Der
 * dukket `TypeError: Failed to fetch` opp hver natt, slagene ble liggende i
 * Dexie-køen og lever-knappen ble aldri enabled.
 *
 * Kuren er å lese de samme konvensjonelle variablene som Node-siden bruker og
 * oversette dem til Playwrights `use`-felter. Er ingen av dem satt — CI på GitHub
 * Actions, lokal utvikling på Mac — returneres et tomt objekt, og `use` i
 * playwright.config.ts blir bit-for-bit som før. Det er den viktigste egenskapen:
 * miljøets særegenheter løses i repoet, aldri ved å røre CI-oppsettet (samme
 * mønster som PLAYWRIGHT_PORT #1259 og PW_CHROMIUM_EXECUTABLE_PATH #1183).
 */

/**
 * Miljøet lest som ren data. Ikke `NodeJS.ProcessEnv`: Next utvider den typen med
 * en påkrevd `NODE_ENV`, så testene måtte ha oppgitt den i hvert eneste kall.
 * `process.env` er assignable hit.
 */
export type EgressEnv = Readonly<Record<string, string | undefined>>;

/** Playwright-proxyen slik `use.proxy` vil ha den. */
export type EgressProxy = {
  server: string;
  bypass: string;
  username?: string;
  password?: string;
};

/** Fragmentet som spres inn i `use` — begge feltene utelates når env er stille. */
export type EgressUse = {
  proxy?: EgressProxy;
  ignoreHTTPSErrors?: boolean;
};

/**
 * Rekkefølgen avgjør hvem som vinner når flere er satt: uppercase før lowercase,
 * https før http. Deterministisk (og test-låst) framfor «tilfeldig hvilken Node
 * så først».
 */
const PROXY_VARS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
] as const;

const NO_PROXY_VARS = ['NO_PROXY', 'no_proxy'] as const;

/**
 * Signalet «TLS her termineres av en CA Node er bedt om å stole ekstra på».
 * Nettleseren skal stole på det samme; se `ignoreHTTPSErrors` nedenfor.
 */
const CA_VARS = ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'] as const;

/**
 * Appen under test kjører på localhost og skal aldri gå via proxyen — ellers
 * ville Chromium tunnelert sine egne sidelastinger ut og inn igjen.
 */
const ALWAYS_BYPASS = ['localhost', '127.0.0.1'];

/** Tom streng teller som usatt (samme felle som `??` i #1259s PLAYWRIGHT_PORT-vakt). */
function firstSet(
  env: EgressEnv,
  names: readonly string[],
): { name: string; value: string } | null {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function parseProxy(
  name: string,
  value: string,
): Omit<EgressProxy, 'bypass'> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${name} er ikke en gyldig URL: «${value}». Forventet f.eks. http://vert:3128.`,
    );
  }
  if (!url.hostname) {
    throw new Error(
      `${name} mangler vertsnavn: «${value}». Forventet f.eks. http://vert:3128.`,
    );
  }

  // Chromium bruker IKKE brukernavn:passord fra proxy-URL-en i env — Playwrights
  // egne username/password-felter er veien for proxy-auth. Derfor splittes
  // userinfo ut av `server` her i stedet for å sendes videre som del av URL-en.
  const proxy: Omit<EgressProxy, 'bypass'> = {
    server: `${url.protocol}//${url.host}`,
  };
  if (url.username) proxy.username = decodeURIComponent(url.username);
  if (url.password) proxy.password = decodeURIComponent(url.password);
  return proxy;
}

/**
 * Leddene sendes videre som de står — vi trimmer bare bort tomme ledd og
 * dupliserte oppføringer. Chromium behandler et ledende `.` (`.supabase.co`) likt
 * med `*.supabase.co`, så ingen omskriving trengs her.
 */
function buildBypass(env: EgressEnv): string {
  const fromEnv = (firstSet(env, NO_PROXY_VARS)?.value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const bypass = [...ALWAYS_BYPASS];
  for (const entry of fromEnv) {
    if (!bypass.includes(entry)) bypass.push(entry);
  }
  return bypass.join(',');
}

/**
 * Oversetter miljøvariablene Node-siden allerede bruker til et `use`-fragment for
 * Playwright. Ingen av dem satt → `{}` (CI og lokal Mac er uendret).
 *
 * @throws når en satt proxy-variabel ikke er en URL med vertsnavn — stille
 * ignorering ville gitt «rødt uten forklaring» i nettopp det miljøet som trenger
 * proxyen.
 */
export function egressFromEnv(env: EgressEnv): EgressUse {
  const use: EgressUse = {};

  const proxyVar = firstSet(env, PROXY_VARS);
  if (proxyVar) {
    use.proxy = { ...parseProxy(proxyVar.name, proxyVar.value), bypass: buildBypass(env) };
  }

  // `ignoreHTTPSErrors` framfor en SPKI-liste: bundelen måtte i så fall PEM-parses
  // i configen for et testrigg-problem bryteren løser i én linje. Riggen snakker
  // bare med localhost (uten TLS) og staging-Supabase, så den maskerer ingenting
  // vi vil fange i e2e.
  if (firstSet(env, CA_VARS)) use.ignoreHTTPSErrors = true;

  return use;
}
