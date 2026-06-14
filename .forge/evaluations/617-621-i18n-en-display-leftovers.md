# Evaluering: i18n en-modus-visningsrestanser (#617 + #621)

**Verdikt: ACCEPT**

Fresh-context skeptisk gjennomgang av de tre siste commits på `claude/crazy-shaw-5cc16a`
(`ef506709` #617, `afe05baf` #621, `4b519eae` kontrakt-doc) mot kontrakten i
`.forge/contracts/617-621-i18n-en-display-leftovers.md`. Hver suksesskriterie er
verifisert ved kode-inspeksjon + uavhengig kjøring av alle gates.

---

## Gate-resultater

| Gate | Kommando | Resultat |
|---|---|---|
| 1 | `npx vitest run lib/games/autoGameName.test.ts lib/handicap/sign.test.ts` | **PASS** — `Test Files 2 passed (2)`, `Tests 81 passed (81)` |
| 2 | `npx tsc --noEmit` | **PASS** — `TSC_EXIT=0` (0 feil) |
| 3 | `npm run build` | **PASS** — `✓ Compiled successfully in 3.7s`, `✓ Generating static pages (256/256)` |

Byte-identitet for norsk verifisert separat med Node: for alle relevante magnituder
(12.4, 1.5, 0, 54, 8, 1.25, 5.5, 0.5) gir `(m).toLocaleString('nb-NO')` nøyaktig samme
streng som gammel `String(m).replace('.', ',')`. Grupperingsskille (`1 234,5`) inntreffer
først ved ≥1000 — umulig for handicap (cap 54), så ingen grupperings-risiko.

---

## Per-kriterie verdikt

### #617 — re-lokaliser auto-genererte spillnavn

- **`localizeGameName` finnes, ren funksjon, TZ-fri, forankret til banenavn** — VERIFISERT.
  `lib/games/autoGameName.ts:96-115`. Ren funksjon (ingen side-effekter). Genuint TZ-fri:
  parser dag (`match[1]`) + måned-indeks (`NORWEGIAN_MONTHS.indexOf(match[2])`) UT AV den
  lagrede strengen — kaller ingen `new Date().getDate()` på sann-tid. Den syntetiske datoen
  (`autoGameName.ts:113`) bruker `2000-MM-DDT12:00` (kl. 12), så `.getDate()`/`.getMonth()`
  inne i `suggestGameName` ikke kan rulle over ved midnatt/DST. Forankret via literal
  `name.startsWith(`${courseName} `)` (`:102-103`) — ikke regex på banenavn, så regex-
  spesialtegn i banenavn (`A.B (Golf)`) kan ikke gi falsk match (egen test `:164-168` låser dette).
- **`'no'` byte-identisk** — VERIFISERT. Tidlig retur `autoGameName.ts:101` (`locale === 'no'`).
  Test `:120-124` + alle 12 `suggestGameName` 'no'-måneds-cases grønne.
- **Anvendt på FinishedGameCard, renderGameCard (Hjem), GamesLedger (admin)** — VERIFISERT.
  - `components/games/FinishedGameCard.tsx:41` — `localizeGameName(game.name, game.courses?.name ?? null, locale)`; `locale = useLocale()` (`:30`).
  - `app/[locale]/page.tsx:251` (HomeBody) — `localizeGameName(g.name, g.courses?.name ?? null, locale)`; `locale = await getLocale()` (`:108`).
  - `app/[locale]/admin/games/page.tsx:290` (GamesLedger) — `localizeGameName(g.name, g.courses?.name ?? null, locale as AppLocale)`; `locale = await getLocale()` (`:196`).
  - **Real banenavn, ikke fallback-streng:** kritisk sjekk besto. Admin-siden har et separat
    `const courseName = g.courses?.name ?? '(ukjent bane)'` (`:253`) for meta-linja, MEN
    `localizeGameName`-kallet (`:290`) sender `g.courses?.name ?? null` — altså `null` (ikke
    `'(ukjent bane)'`) når bane mangler, så navnet returneres urørt. Ingen false-positive.
- **Egendefinerte navn re-lokaliseres IKKE** — VERIFISERT. Tester: ikke-auto-format (`:132`),
  ekstra suffiks etter måned (`:136`), prefiks-mismatch (`:142`), ukjent måned (`:148`),
  `courseName` null (`:154`), kun banenavn uten tee-off (`:160`). Round-trip 12 måneder (`:172-189`).
- **Oppfølgings-issue filet med milestone** — VERIFISERT. #624 OPEN, milestone
  «Backlog — uplanlagt / scale-triggered».

### #621 — locale-bevisst handicap-visning

- **Profil-header bruker `formatHcpDisplay(...)`** — VERIFISERT. `app/[locale]/profile/page.tsx:195`
  `formatHcpDisplay(profile.hcp_index, locale)`; `locale = await getLocale()` i scope i
  `ProfileFormCard` (`:169`). Gamle `fromSignedHcp`/`formatGolfboxHcp`-imports fjernet, kun
  `formatHcpDisplay` importert (`:23`). Ingen foreldreløse symboler i fila.
- **`formatGolfboxHcp` fikk `locale`-param (default 'no'), bevarer echo-semantikk** — VERIFISERT.
  `lib/handicap/sign.ts:38-45`: `formatGolfboxHcp(magnitude, isPlus, locale = 'no')`,
  `formatNumber(magnitude, locale)` UTEN `minimumFractionDigits` → ingen tvungen desimal,
  echo-semantikk intakt. Default `'no'` → byte-identisk for eksisterende kall.
- **Live «Lagres som …» sender aktiv locale** — VERIFISERT.
  `ProfileFormBody.tsx:210` (`locale = useLocale()` `:74`) og `OnboardingHcpField.tsx:67`.
  `OnboardingHcpField` manglet `useLocale` før — nå lagt til (`:4` import + `:21` `useLocale()`).
- **Norsk byte-identisk** — VERIFISERT. Default-locale-cases + «explicit 'no' matches default»
  (`sign.test.ts:60-62`) grønne; empirisk Node-sjekk bekreftet identitet for alle hcp-magnituder.

### Tverrgående

- **Ingen nye ubrukte imports/variabler** — VERIFISERT. Global grep: `fromSignedHcp` brukes
  fortsatt på `ProfileFormBody.tsx:63`, `formatGolfboxHcp` på to call-sites — så `sign.ts`
  har ingen død kode. `tsc --noEmit` (som flagger `noUnusedLocals`) gir 0 feil.
- **Versjon + CHANGELOG** — VERIFISERT. `package.json` → `1.129.4`. CHANGELOG har
  `[1.129.4] · #621` (`:24`) og `[1.129.3] · #617` (`:37`), begge under åpen 1.129.y-tema.

---

## Funn / issues

**Ingen.** Hverken funksjonelle, TZ-, regresjons- eller dead-code-funn. Implementasjonen
følger kontraktens besluttede tilnærming nøyaktig (parse-fra-streng, ikke re-format-fra-
tee-off; echo-semantikk bevart i `formatGolfboxHcp`; én-desimal kun i `formatHcpDisplay`).

---

## Residual: UI-verifikasjon

De berørte flatene (Hjem, profil, `/en/admin`) er auth- og data-gatede, og endringene ligger
på en branch som ennå ikke er deployet. En lokal Playwright-gjennomgang ville treffe
login-redirect uten en seeded sesjon. UI-rendering-kriteriene er derfor verifisert ved
kode-inspeksjon + Type A-testene som låser transformasjons-logikken (81 grønne) + empirisk
byte-identitets-sjekk. Ingen kode-nivå-grunn funnet til at rendret output skulle bli feil.
Live `/en`-verifikasjon overlates til eier i prod (jf. production-only-testing). Dette er en
restanse, ikke en feil.
