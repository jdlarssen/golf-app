# Evaluation: #1022 Turneringsplakat og offentlig påmeldingsside

**Kontrakt:** `.forge/contracts/1022-turneringsplakat-offentlig-pamelding.md`
**Evaluert:** 2026-07-03 mot HEAD `7c8cdcd5` (commit-range `b1851ffe..7c8cdcd5`, 8 commits, worktree clean).
**Evaluator:** fresh-context skeptisk subagent

## Slutt-verdict: **ACCEPT**

Alle sju kriterier PASS med live curl-/REST-evidens mot dev-serveren (torny-staging) og kode-nivå-verifisering. Gates grønne med eksplisitte exit-koder. Evaluator gikk lenger enn kontrakt-evidensen på K5: staging-kolonnen, byggerens to attribusjons-rader og RPC-gatene er **uavhengig re-verifisert via read-only PostgREST** — kun prod-anvendelsen hviler på byggerens dokumenterte evidens (ingen prod-creds i denne worktreen). Fire småfunn, ingen blockere.

---

## Gates (HEAD `7c8cdcd5`, Node 22.23.0)

| Gate | Resultat | Bevis |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | `TSC_EXIT=0` (kjørt av evaluator, ingen pipe-maskering) |
| `npm run lint` | ✅ PASS | `LINT_EXIT=0`; **0 errors**, 52 warnings (alle i pre-eksisterende complexity-klasse; INGEN warnings i noen av de nye filene — verifisert per-fil fra lint-loggen) |
| `npx vitest run` (hele suiten) | ✅ PASS | `VITEST_EXIT=0` — **359 filer / 4524 tester, alle grønne** (eksakt match med kontraktens tall; inkluderer catalogParity) |
| `npm run build` | ✅ | Ikke re-kjørt av evaluator (dev-server kjører på worktreen). Byggeren kjørte grønn etter siste kodeendring `81ff4c6f`; eneste commit etter (`7c8cdcd5`) rører KUN `.forge/contracts/*.md` (verifisert med `git show --stat`); tsc grønn på HEAD. Samme aksept-mønster som 1007-evalueringen. |
| Migrasjon 0128 staging → prod | ✅ / ⚠️ delvis | **Staging uavhengig verifisert** (read-only REST, se K5). **Prod ikke uavhengig verifisert** — byggerens dokumenterte read-only-probe (`public_signups=0`) + `database.types.ts` med `signup_source` er evidensen. |
| Staging-klikkrunde | ✅ | Byggerens to rader **uavhengig bekreftet** via read-only REST GET (se K5) — begge flyter (`poster` og `public_page`) beviselig fullført ende-til-ende på staging. |
| Versjon/CHANGELOG-kjede | ✅ PASS | Se commit-tabellen under. 1.167.1 → 1.168.0 (feat, minor, Funksjoner-rad) → 1.168.1 (fix, patch, `[no-changelog]`). Alle 8 commits har `Refs #1022`. |

---

## Funn

### F1 — MINOR: `@types/qrcode` ligger i `dependencies`

`package.json:26` — alle andre `@types/*` (node, react, react-dom, web-push) ligger i `devDependencies` (:43-46). Harmløst funksjonelt (Vercel installerer begge), men bryter repoets plasseringskonvensjon. Én-linjes flytt ved anledning.

### F2 — INFO: Dobbelt `getGameByShortId`-oppslag per landing-render

`generateMetadata` (page.tsx:39) og selve siden (page.tsx:107) kaller begge `getGameByShortId` uten `React.cache()`-dedup — to single-row-oppslag per uinnlogget request (OG-scrape gir et tredje via opengraph-image.tsx:46). Neglisjerbart (indeksert PK-aktig oppslag), men et `cache()`-wrap er gratis hvis flaten får trafikk.

### F3 — INFO: Prod-migrasjonen ikke uavhengig verifisert

Ingen prod-credentials i worktreen (kun `.env.staging.local`), så evaluator kunne ikke reprodusere prod-proben. Byggerens evidens (read-only-verifisert, `public_signups=0`, types-diff mot MCP-generert prod-skjema) er detaljert og konsistent med at `lib/database.types.ts` faktisk bærer `signup_source` — men den står som dokumentert, ikke reprodusert. **Før merge:** hovedchatten bør bekrefte at 0128 er påført prod (0107-mønsteret krever det).

### F4 — INFO: Team-flyten får ikke src-attribusjon

`TeamRegistrationForm`/`teamActions` er urørt — kun `registerForOpenGame` setter `signup_source`. Dette er i tråd med kontrakt-beslutning 5 («kun open-modus-insert i v1»; requestApproval-innsendinger går i requests-tabellen og arver ikke), men designavsnittets «src videreført til påmeldings-skjemaene» (flertall) kunne leses bredere. Nevn scopet i closing-kommentaren så det ikke ser ut som en glipp.

---

## Per kriterium

### K1 Offentlig landing — ✅ PASS (live-verifisert)

- `GET /signup/u9mqplnh` (uinnlogget curl) → HTTP 200 med `data-testid="public-landing"`, `public-landing-roster`, `public-landing-join`, `public-landing-poster-link`; spillnavn «E2E-1022 Åpen kveldsmatch», roster «Test A.», «Bli med»-CTA, plakat-lenke.
- Negative caser: `o8x8uklh` (invite_only), `vx8uzbhi` (stengt), `zzzzzzzz` (ukjent) → alle bærer RSC-markøren `login?next=%2Fsignup%2F<id>;307`, 0 forekomster av `public-landing`-testid, 0 forekomster av spillnavn (`grep -c 'E2E-1022'` = 0 i alle tre).
- Predikatet er én ren funksjon (`lib/games/publicSignupVisibility.ts:22-28`) brukt av page (:119), OG (:53) og plakat (:39); 7 Type A-tester dekker draft/active/finished/invite_only/stengt (`publicSignupVisibility.test.ts`).
- `?src=`-videreføring live-verifisert: `?src=plakat` → CTA-href `/login?next=%2Fsignup%2Fu9mqplnh%3Fsrc%3Dplakat`; `?src=evil` → src **droppet** fra href; ikke-synlig + `?src=public` → src bevart i login-redirect-markøren.

### K2 Innlogget uendret — ✅ PASS

- Kode-nivå: hele den innloggede kaskaden i `page.tsx:150-300` er strukturelt uendret (profil → allerede påmeldt → pending → locked → stengt → klubb → venn → invite_only → team/solo); eneste delta er optional `src`-prop (default null) inn i `RegistrationForm` — bakoverkompatibel (`RegistrationForm.tsx:29-33`).
- Ingen eksisterende signup-tester endret i diffen; hele suiten (4524) grønn.
- Sterkeste bevis: byggerens to staging-rader (uavhengig verifisert, se K5) ble skapt gjennom de EKTE flytene — innlogget + `?src=plakat` og full uinnlogget OTP-runde — så begge påmeldingsløyper fungerer beviselig ende-til-ende.

### K3 OG-bilde — ✅ PASS (live-verifisert)

- `GET /signup/u9mqplnh/opengraph-image` → HTTP 200, `image/png`, `file`-verifisert «PNG image data, **1200 x 630**».
- Ikke-synlige: `o8x8uklh` og `zzzzzzzz` → begge 200 PNG 1200×630 og **byte-identiske** (`cmp` exit 0) → beviselig generisk brandkort uten spilldata; public-varianten differ (52578 vs 35290 bytes).
- Sidens HTML: `og:title` = spillnavn, `og:description`, `og:image` (+type/width/height/alt) og `twitter:card=summary_large_image` — alle grep-et fra live HTML. Ikke-synlig side: generisk `og:title` «Påmelding – Tørny», ingen spillnavn.
- Next 16-konvensjon fulgt: `await params` som Promise, `alt`/`size`/`contentType`-exports; **ingen `export const runtime`** (grep over hele signup-segmentet + lib/og traff kun kommentaren som forklarer forbudet, opengraph-image.tsx:21).
- Fonts-robusthet: betinget spread `...(fonts.length > 0 ? { fonts } : {})` (:200) — fiksen i `81ff4c6f`.

### K4 Plakat — ✅ PASS (live-verifisert)

- `GET /signup/u9mqplnh/plakat` → 200 med `data-testid="poster"` + `poster-qr`; `print:hidden` på knapp-wrapperen (`PrintButton.tsx:10`); klartekst-URL til stede (SSR-komment-splittet: `tornygolf.no/signup/<!-- -->u9mqplnh`).
- QR verifisert mot fasit: evaluator genererte SVG lokalt med `qrcode` for `https://tornygolf.no/signup/u9mqplnh?src=plakat` med eksakt kontrakt-options — **begge path-data-strengene (2/2) finnes verbatim i plakat-HTML-en**, dark-farge `#1B4332` bekreftet.
- Ikke-synlig spill: `/signup/vx8uzbhi/plakat` → redirect-markør `/signup/vx8uzbhi;307` (tilbake til påmeldingssiden som eier gaten), 0 poster-testids.
- Admin-inngang: plakat-lenke i `RegistrationOverviewSection.tsx` (data-testid="poster-link"), gatet bak `registrationMode !== 'invite_only'` — konsistent med synlighets-predikatet.

### K5 Attribusjon — ✅ PASS (staging uavhengig verifisert; prod dokumentert)

- **Uavhengig REST-verifisering (read-only, service-role fra `.env.staging.local`):**
  - `GET game_players?game_id=eq.ac4575ae-…&signup_source=not.is.null` → nøyaktig to rader: `{"signup_source":"poster"}` og `{"signup_source":"public_page"}`, begge `withdrawn_at:null` — byggerens klikkrunde-evidens bekreftet.
  - `POST rpc/admin_key_metrics` med service-role (ingen JWT-bruker) → `P0001 not_authorized` — in-body `is_admin()`-gaten virker.
  - Samme med anon-key → `42501 permission denied for function admin_key_metrics` — revoke-en fra 0104-mønsteret er påført staging.
- Migrasjon `0128_signup_source_public_metric.sql`: nullable kolonne + CHECK `('public_page','poster')` (:17-19); RPC-kroppen diffet mot 0127 — **eneste delta er det additive `public_signups`-feltet** (count over `signup_source is not null and withdrawn_at is null`, uten finished-join, per kontrakt), oppdatert kommentar og eksplisitt revoke/grant. Gjeste-ekskluderingen fra 0127 er intakt.
- Server-side allowlist i action: `signupSourceFromParam(String(formData.get('src') ?? '') || undefined)` (`actions.ts` i registerForOpenGame) — hostile POST med vilkårlig src blir null i app-laget OG avvises av CHECK i DB. 6 Type A-tester dekker mapping inkl. 'evil', tom streng og array (13 totalt i fila).
- `parseMetrics`-narrowing utvidet (`KeyMetricsCard.tsx`), `KeyMetricsView` med `data-testid="key-metrics-public-signups"` + i18n-nøkkel no/en, Type C-test oppdatert (asserter 5).
- **Ikke uavhengig verifisert:** prod-anvendelsen (F3) og CHECK-avvisningen ved faktisk write (krever INSERT — bevisst ikke utført).

### K6 Ingen lekkasje — ✅ PASS (live-verifisert)

- `formatPublicName` (fornavn + etternavns-initial, 8 tester); roster-helperen select-er KUN `users(name, nickname)` for `withdrawn_at is null` og formaterer FØR retur (`getPublicSignupRoster.ts:27-44`).
- Live landing-HTML: e-post-regex traff kun i18n-plassholdere (eier@eksempel.no, klubb@tornygolf.no osv. fra den serialiserte meldingskatalogen — inspisert enkeltvis); «handicap/hcp»-treff kun katalog-strenger; **0 UUID-er** i landing- og plakat-HTML; ingen fulle etternavn (kun «Test A.»).
- Ikke-synlige flater: 0 bytes spilldata (navn-grep = 0 i alle tre negative caser); OG-fallback byte-identisk på tvers av invite_only/ukjent → kan umulig bære spilldata.
- `getGameByShortId` beholder regex-guard `^[0-9a-z]{8}$` før DB-kall og felt-whitelisten er uendret.

### K7 Copy + flyt — ✅ PASS

- 16 nye nøkler i `signup.public` + `keyMetricsPublicSignups` + `posterLink`, **begge** kataloger (no/en); catalogParity grønn i full-suite-kjøringen. `posterFooter` = kanonisk brand-tagline (bevisst bevart per CLAUDE.md).
- `docs/flows/02-bli-med-i-spill-fremtid.svg`: C-noden omskrevet til «Delt lenke eller plakat-QR» med #1022-badge og gull-ramme; PNG regenerert (454359→462794 bytes) i samme commit (`8e3dfdeb`).
- Humanizer-kjøringen er ikke verifiserbar fra git (samme forbehold som 1007-evalueringen); copyen leser idiomatisk og kort.

---

## Commit/versjon-kjede

| Commit | Type | Versjon | CHANGELOG | Refs |
|---|---|---|---|---|
| `b1851ffe` refactor(og) | refactor | — (1.167.1) | — | #1022 |
| `ca52c1cb` chore(games) | chore | — | — | #1022 |
| `c23b1d1b` chore(deps) | chore | — | — | #1022 |
| `80feb4e7` chore(db) 0128 | chore | — | — | #1022 |
| `2e11f0d0` feat(signup) | feat | →**1.168.0** MINOR | Funksjoner-rad «1.168 · Offentlig påmeldingsside med plakat» m/ ↳ | #1022 + Part of #1021 |
| `8e3dfdeb` docs(flows) | docs | — | — | #1022 |
| `81ff4c6f` fix(signup) | fix | →**1.168.1** PATCH | `[no-changelog]` (intern robusthetsfiks, aldri shippet) | #1022 |
| `7c8cdcd5` docs(forge) | docs | — | — | #1022 |

Bump-typene matcher commit-msg-hookens regler (feat→minor m/ CHANGELOG, fix→patch m/ `[no-changelog]`); alle bodies har `Refs #1022`.

---

## Restnoter (ikke-blokkerende)

- **Før merge:** bekreft prod-anvendelse av 0128 (F3) — staging er bevist, prod hviler på byggerens dokumentasjon.
- F1 (`@types/qrcode`-plassering) er en én-linjes opprydding, kan tas i PR-en eller senere.
- F4 (team-flyt uten attribusjon) bør nevnes eksplisitt som v1-scope i closing-kommentaren.
- Admin-kortets visuelle render på staging ble stoppet av login-rate-limit hos byggeren; dekket av oppdatert Type C-test + evaluator-bekreftet RPC-shape-logikk — akseptabelt.

## Konklusjon

Kontrakten er oppfylt: alle UI-kriterier live-verifisert med curl mot staging-dev-serveren, QR-en er path-identisk med fasit-generering, negative caser lekker null spilldata (bevist med byte-identiske OG-fallbacks og navn-grep), sikkerhetslagene for `?src=` er tredoble (render-allowlist + action-allowlist + DB-CHECK), og staging-DB-tilstanden er uavhengig re-verifisert read-only. Gates grønne med eksplisitte exit-koder. **ACCEPT.**
