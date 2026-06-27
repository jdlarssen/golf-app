# Evaluering: #945 — Kalender (.ics) + kart for tee-off

**Verdict:** ACCEPT
**Dato:** 2026-06-27

## Gates

Kjørt fra worktree-roten på Node 22.

- **`npm run typecheck` (tsc --noEmit):** PASS — ingen output, exit 0.
- **eslint** (`app/[locale]/games/[id]/(home)/page.tsx`, `.../calendar/route.ts`, `lib/calendar/teeOffIcs.ts`): PASS — `0 errors, 1 warning`. Den ene advarselen er den pre-eksisterende kompleksitets-warningen på `GameHomePage` (complexity 94 > 25). Kontrakten merker den som akseptabel; den nye actions-raden (26 linjer JSX) tilfører ikke nye control-flow-grener av betydning og er ikke kilden til warningen.
- **`npx vitest run lib/calendar messages`:** PASS — 3 filer, 21/21 tester grønne (`teeOffIcs.test.ts` + `catalogParity.test.ts` + `apostropheParity.test.ts`).

## Kriterier

### K1 — `.ics`-bygger: PASS
`lib/calendar/teeOffIcs.ts:102` `buildTeeOffIcs` er en ren funksjon — ingen `Date.now()`/`Math.random()`; `dtstamp` injiseres (`:33`, `:114`). VEVENT har UID/DTSTAMP/DTSTART/DTEND/SUMMARY/(LOCATION)/DESCRIPTION (`:113–125`) + VALARM med ACTION:DISPLAY + TRIGGER + DESCRIPTION (`:127–135`). Escaping-rekkefølge er korrekt: backslash først (`:53–57`), så `;`, `,`, newline. Folding måles i UTF-8-oktetter via `TextEncoder` og itererer per kodepunkt (`for (const char of line)`, `:76`) så æøå aldri splittes (`:65–90`). Testene dekker faktisk dette:
- DTEND = start + duration: `teeOffIcs.test.ts:61` asserter `DTEND:20260715T133000Z` (09:00Z + 270 min).
- CRLF gjennomgående + ingen lone LF: `:131–136`.
- Folding holder fysiske linjer ≤75 oktetter: `:138–150` asserter `tooLong === false` på `TextEncoder().encode(l).length > 75` for alle fysiske linjer, og at unfolding gjenoppretter full SUMMARY.
- VALARM, escaping (`\`, `;`, `,`, `\n`), null/blank course: `:77–128`.

### K2 — Tidssone: PASS
`formatUtc` (`teeOffIcs.ts:39`) bruker `getUTC*`-gettere → `YYYYMMDDTHHMMSSZ`. Eksakt DTSTART-assertion finnes: `teeOffIcs.test.ts:56` asserter `DTSTART:20260715T090000Z` for `new Date('2026-07-15T09:00:00Z')`. Midnatt-rollover for DTEND finnes: `:67–74` (22:00Z + 270 min → `DTEND:20260716T023000Z`, dato ruller fram).

### K3 — Server-rute: PASS
`app/[locale]/games/[id]/calendar/route.ts`. Auth-kjeden speiler `leaderboard/export/route.ts` linje for linje:
- 401 uten proxy-verifisert userId (`:43–49`).
- 404 hvis spill mangler (`:62–64`).
- 404 hvis ikke admin OG ikke deltaker (`:67–70`).
- 404 hvis `finished` ELLER ingen tee-off (`:72–74`).
- Banenavn hentes som slim direkte-call `courses.select('name').eq('id', game.course_id).single()` (`:79–84`). Bekreftet at `getGameWithPlayers` IKKE inkluderer banenavn — payloaden joiner kun `tee_box` og `users` (`getGameWithPlayers.ts:152,159`), så det slanke kallet er nødvendig og riktig.
- Headers: `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="torny-teeoff-<id>.ics"`, `Cache-Control: no-store` (`:101–108`).

Sikkerhet: en ikke-deltaker uten admin treffer `!isAdmin && !players.some(...)` → 404. Profile-/course-spørringer går via cookie-basert `getServerClient()` (RLS-håndhevet); `getGameWithPlayers` bruker admin-klient, men authz re-håndheves på call-site nøyaktig som dokumentert i CLAUDE.md. Ingen hull.

### K4 — UI-lenker: PASS
`(home)/page.tsx:533–558` (diff). Kalender-lenken er en ren `<a href={`/${locale}/games/${id}/calendar`}>` (IKKE next/link/SmartLink) — rendres kun når `teeOffDate` er satt (`:535`). Kart-lenken er `https://www.google.com/maps/search/?api=1&query=` + `encodeURIComponent(game.courses.name)` med `target="_blank" rel="noopener noreferrer"` — rendres når `game.courses?.name` finnes (`:543–551`). Begge har `min-h-[44px]`. Koden støtter implementerens live-staging-påstander (begge lenker, 44px-høyde, korrekte href-er, target/rel). `game.courses?.name` kommer fra page-komponentens egen join (ikke den cachede helperen), så banenavnet er tilgjengelig i UI. Ingen tvil.

### K5 — i18n-paritet: PASS
`game.home.addToCalendar` + `game.home.viewOnMap` og `game.teeOffCalendar.{summary,description,errors.notLoggedIn,errors.unavailable}` finnes i BÅDE `messages/no.json` og `messages/en.json` med identisk struktur. `catalogParity.test.ts` håndhever eksakt leaf-key-likhet (missing + extra = 0) og er grønn → bevis. Ruten refererer nøyaktig disse nøklene under namespace `game.teeOffCalendar` (`route.ts:41,96,97` + `:46,63,69,73`).

### K6 — Versjon + CHANGELOG: PASS
`package.json` = 1.150.0 (minor fra 1.149.0); `package-lock.json` root også 1.150.0. CHANGELOG.md har én ny Funksjoner-oppføring «1.150 · Tee-off rett i kalenderen» med #945-referanse.

## Funn

1. **(nit)** `teeOffIcs.test.ts:77–84` (VALARM-testen) har 4 `toContain`-kall på `ls` — marginalt over heuristikken «maks 3 toContain på samme variabel». Men dette er 4 *distinkte strukturelle linjer* i en VALARM-blokk (`BEGIN:VALARM`, `ACTION:DISPLAY`, `TRIGGER:-PT1H`, `END:VALARM`), ikke gjentatte assertions på én verdi. Et snapshot ville vært mindre lesbart her. Kontraktens egen Type-A-note («assertion-rich») støtter dette. Falsk-positiv fra en grov pre-commit-heuristikk — ikke en reell test-disiplin-brudd, ingen handling nødvendig.

2. **(info, ikke et funn)** DESCRIPTION-ens `gameUrl` bygges fra `new URL(req.url).origin` (`route.ts:86`). I prod gir dette riktig public-host (`https://tornygolf.no/...`), i dev `localhost`. Dette er den etablerte kodebase-konvensjonen — `(auth)/logout/route.ts:8–10` bruker eksakt samme mønster med samme begrunnelse («works in any environment without hard-coding an origin»). URL-en er kun informativ tekst inni kalender-hendelsens beskrivelse, ikke en sikkerhets-sensitiv redirect. Akseptabelt.

## Konklusjon

Alle seks kriterier er direkte verifisert mot kode og test-output, og alle tre gates passerer (typecheck rent, eslint kun pre-eksisterende kompleksitets-warning, vitest 21/21). `.ics`-byggeren er korrekt ren og RFC-5545-konform med ekte tester for escaping/folding/UTC/VALARM/DTEND; ruten speiler den godkjente auth-referansen uten sikkerhetshull; UI-lenkene er rene `<a>`-er med riktige attributter; i18n-pariteten håndheves av en grønn test. Anbefaling: **ACCEPT** — klar for merge.
