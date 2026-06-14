# Kontrakt: Fullfør i18n en-modus-visningsrestanser (#617 + #621)

**Issues:** [#617](https://github.com/jdlarssen/golf-app/issues/617) (auto-genererte spillnavn lokaliseres ikke) + [#621](https://github.com/jdlarssen/golf-app/issues/621) (handicap med norsk komma i engelsk modus)
**Branch:** `claude/crazy-shaw-5cc16a`
**Milestone-restanse:** i18n-epic #60 (Fase G-rester)

## Problem

To selvstendige men beslektede lekkasjer der **engelsk modus (`/en`) viser norsk-formatert innhold**. Felles rot-årsak: locale brukes ikke ved visning.

- **#617** — Auto-genererte spillnavn fryser norsk månedsnavn ved opprettelse. På `/en` viser et spillkort «Byneset North 12. juni» mens datolinja rett under er korrekt engelsk («12 Jun»). Blandet norsk/engelsk overflate.
- **#621** — Profil-siden viser handicap med norsk komma («hcp 12,4») i engelsk modus. Tallet stikker seg ut mot resten av siden som er lokalisert.

## Mål

`/en` viser konsekvent engelsk-formatert innhold på de berørte flatene; **norsk visning forblir byte-identisk** (ingen regresjon på `/` / `/no`).

---

## Del A — #617: re-lokaliser auto-genererte spillnavn ved visning

### Tilnærming (besluttet)

Navnet lagres som frosset streng i `games.name` og kan ikke endres ved migrasjon uten å vite hvilke navn som er auto-genererte vs. manuelt skrevne. **Approach: parse dag + måned ut av den frosne norske strengen selv** (forankret til banenavnet), og reformater for aktiv locale.

Dette ble valgt fordi:
- **Ingen schema-/query-endring** — trenger bare `name` + `courseName` + `locale`, alle tre finnes allerede på alle berørte render-sites (`getFinishedGamesForUser`-projeksjonen har f.eks. ikke `scheduled_tee_off_at`, men trenger det heller ikke med denne tilnærmingen).
- **Tidssone-fri** — bruker dag/måned som ligger _i_ den lagrede strengen, ikke et nytt `new Date().getDate()`-kall som kunne forskyve dagen mellom opprettelses-TZ (klient, Norge) og visnings-TZ (Vercel, UTC).
- **Presis** — forankret til spillets faktiske banenavn, så bare strenger på det eksakte norske auto-formatet «{bane} {dag}. {måned}» blir rørt. Egendefinerte navn passerer urørt.
- **Selv-helbredende** — virker på eksisterende rader uten backfill.

### Ny helper: `localizeGameName`

Plasseres i `lib/games/autoGameName.ts` (samlokalisert med `suggestGameName`, deler `NORWEGIAN_MONTHS`).

```ts
localizeGameName(name: string, courseName: string | null, locale: AppLocale): string
```

Kontrakt (ren funksjon):
- `locale === 'no'` → returner `name` uendret (byte-identisk norsk).
- `courseName` tom/null → returner `name` (kan ikke forankre).
- `name` matcher IKKE `^{courseName} (\d{1,2})\. ({norsk måned})$` → returner `name` (egendefinert navn passerer urørt).
- Match: reformater til aktiv locale via `suggestGameName` med en **syntetisk kl. 12-dato** (unngår midnatt/DST-rollover i `.getDate()`), så «Byneset North 12. juni» → «Byneset North 12 June» på `/en`.

DRY: gjenbruk `suggestGameName`s eksisterende en-gren for selve måneds-Intl-formateringen (ikke dupliser Intl-koden).

### Render-sites (anvend helperen)

| Site | Fil | Flate |
|---|---|---|
| Avsluttede spill | `components/games/FinishedGameCard.tsx:40` | Hjem «Finished games» + `/spill-arkiv` (delt komponent → begge dekkes) |
| Pågår/Mine spill | `app/[locale]/page.tsx:250` (`renderGameCard`) | Hjem — samme side, samme lekkasje. Tas med så `/en` Hjem blir helt ren (ikke halv fiks). |
| Recent activity | `app/[locale]/admin/games/page.tsx:289` (`GamesLedger`) | `/en/admin` |

Alle tre har allerede `courses?.name` + aktiv `locale` i scope.

### Bevisst UTENFOR scope (Del A)

Andre flater som rendrer `game.name` (spill-detalj `PageHeader`, signup-sider, leaderboard-headere, profil/historikk, klubbhuset, admin spill-detalj) er ikke navngitt i #617 og rører ikke nødvendigvis samme data. **Filer ett oppfølgings-issue** som lister dem så helperen kan feies app-bredt senere. Ikke gold-plate inn i dem nå.

---

## Del B — #621: locale-bevisst handicap-visning

### Site 1 — Profil-header (lagret verdi)

`app/[locale]/profile/page.tsx:192-198`. I dag: `fromSignedHcp` + `formatGolfboxHcp(magnitude, isPlus)`. → Bytt til **`formatHcpDisplay(profile.hcp_index, locale)`** (finnes alt fra #615; én desimal, locale-riktig skille, «+» på pluss). `locale` er i scope. Matcher admin-spillerlista. Fjern nå-ubrukte imports (`fromSignedHcp`/`formatGolfboxHcp`) hvis de blir foreldreløse.

### Sites 2 & 3 — Live «Lagres som …»-bekreftelse (echo av input)

`app/[locale]/profile/ProfileFormBody.tsx:210` + `app/[locale]/complete-profile/OnboardingHcpField.tsx:65`. Disse echo-er det brukeren taster akkurat nå (kun synlig ved plusshandicap).

**Gray-area-beslutning (var åpen i issue, nå avklart):** Gjør `formatGolfboxHcp` locale-bevisst — men behold dens «echo som tastet»-semantikk (IKKE tving én desimal). Begrunnelse:
- Header (Site 1) viser den **kanoniske lagrede verdien** → `formatHcpDisplay` (én desimal) er riktig.
- Bekreftelsen (Sites 2/3) speiler **live input** → skal være tro mot det som tastes (ingen avrunding), bare med riktig desimalskille per språk.
- De to helperne har dermed distinkte, dokumenterte roller. `formatGolfboxHcp` overlever (får `locale`-param), blir ikke død kode.

Endring i `lib/handicap/sign.ts`:
```ts
formatGolfboxHcp(magnitude: number, isPlus: boolean, locale: AppLocale = 'no'): string
```
- `locale` defaulter til `'no'` → eksisterende kall + eksisterende test byte-identiske.
- Bytt `String(magnitude).replace('.', ',')` → `formatNumber(magnitude, locale)` (ingen tvungne fraction-digits → bevarer tastet presisjon, gir «12,4» på no / «12.4» på en).
- Oppdater begge call-sites til å sende aktiv `locale` (`useLocale()` — verifiser at `OnboardingHcpField` har den; legg til om nødvendig).

---

## Tester

**Type A (ren logikk, TDD — skriv test FØR impl):**

- `lib/games/autoGameName.test.ts` — nytt `describe('localizeGameName')`:
  - `'no'` → uendret (byte-identisk).
  - `'en'` norsk auto-format → engelsk: «Byneset North 12. juni» → «Byneset North 12 June».
  - `'en'` egendefinert navn (ingen måned-pattern) → uendret.
  - `'en'` navn uten banenavn-prefiks → uendret.
  - `'en'` `courseName` null → uendret.
  - `'en'` navn == banenavn (ingen tee-off-suffiks) → uendret.
  - Round-trip: `suggestGameName(...'no')` → `localizeGameName(..., 'en')` === `suggestGameName(...'en')`.
- `lib/handicap/sign.test.ts` — utvid `formatGolfboxHcp`-`it.each` med locale-dimensjon:
  - eksisterende no-cases uendret (default-locale, byte-identisk),
  - en-cases: «12.4», «+1.5» (punktum, ikke komma).

**Ikke** legg til render-tester for de berørte UI-flatene (Type C-tak: maks én per komponent, og vi re-asserter ikke tall/strenger fra Type A). E2E urørt.

## Gates

Scoped til det som endres:
1. `npx vitest run lib/games/autoGameName.test.ts lib/handicap/sign.test.ts` — grønt.
2. `npx tsc --noEmit` — ingen nye feil.
3. `npm run build` — kompilerer (Next.js 16, ekshaustive switch/Record holder).
4. Endrede norske strenger (forventet ingen ny prosa): kjør `humanizer` hvis noe norsk copy faktisk endres. NO→EN gjelder ikke (ingen ny oversatt prosa).

## Suksesskriterier

- [x] **#617** `localizeGameName` finnes i `lib/games/autoGameName.ts`, ren funksjon, TZ-fri, forankret til banenavn. — `lib/games/autoGameName.ts:74-110`; syntetisk kl.12-dato unngår rollover; 13 tester grønne.
- [x] **#617** «no» returnerer navnet byte-identisk. — `autoGameName.ts:91` tidlig retur for 'no'; test «returnerer navnet byte-identisk i 'no'» + alle eksisterende `suggestGameName` 'no'-cases grønne.
- [x] **#617** Anvendt på `FinishedGameCard`, `renderGameCard` (Hjem) og `GamesLedger` (admin). — `components/games/FinishedGameCard.tsx:41`, `app/[locale]/page.tsx:251`, `app/[locale]/admin/games/page.tsx:290`. (Live `/en`-sjekk: eier i prod, jf. prod-only-testing.)
- [x] **#617** Egendefinerte navn re-lokaliseres IKKE. — tester «lar et egendefinert navn … stå urørt», «ekstra suffiks … urørt», «prefiks matcher ikke … urørt», «ukjent måned … urørt».
- [x] **#617** Oppfølgings-issue filet for gjenstående `game.name`-flater (med milestone). — #624 (Backlog).
- [x] **#621** Profil-header bruker `formatHcpDisplay(...)`. — `app/[locale]/profile/page.tsx:195` + import-bytte linje 23; test «engelsk: signert 12.2 → 12.2».
- [x] **#621** Live «Lagres som …» bruker locale-bevisst `formatGolfboxHcp(..., locale)`. — `ProfileFormBody.tsx:210`, `OnboardingHcpField.tsx:65` (+ `useLocale` lagt til); test «'en': magnitude 1.5 plus=true → +1.5».
- [x] **#621** Norsk visning byte-identisk. — `formatGolfboxHcp` locale defaulter til 'no'; eksisterende default-cases + «explicit 'no' locale matches the default» grønne.
- [x] Alle gates grønne. — `tsc --noEmit` 0 feil; `vitest` 81/81 (autoGameName + sign); `npm run build` OK (full rute-tabell).
- [x] Versjon bumpet + CHANGELOG. — 1.129.3 (#617) + 1.129.4 (#621) under åpen 1.129.y-tema; commits `ef506709` (Refs #617) + `afe05baf` (Refs #621).

## Out of scope / risikoer

- #622 («roster»-anglisme) — egen app-bred term-beslutning, ikke her.
- Andre `game.name`-flater — eget oppfølgings-issue (se Del A).
- TZ-edge: tilnærmingen er TZ-fri ved design (parser embedded dag/måned), så ingen dag-forskyvnings-risiko.
- False-positive: en bane bokstavelig kalt «… 5. mai» + et navn på akkurat det formatet ville re-lokaliseres på `/en`. Ekstremt usannsynlig, og resultatet er korrekt engelsk uansett.
