# Forge-kontrakt: #362 — Lag-påmelding (signup/team) polish

**Issue:** [#362](https://github.com/jdlarssen/golf-app/issues/362) — Lag-påmelding (signup/team): inline-validering, autocomplete, tydeligere «bli med»
**Branch:** `claude/epic-hamilton-b530aa`
**Flyt-forankring:** UX-flyt-audit funn #8 (`docs/user-flows.md`) — kjerne-flyt 8 (Lag-påmelding). Bekreftet core.
**Milestone:** Tier 1 — Onboarding & førsteinntrykk.

## Mål

Fjerne tre friksjonspunkter i kaptein- og medspiller-flyten for lag-påmelding:

1. **Inline-validering** — felt valideres fortløpende, ikke bare ved submit. En slot-e-post uten `@` gir i dag den misvisende serverfeilen `team_name_invalid` ([teamActions.ts:248](app/signup/[shortId]/teamActions.ts)). Klienten skal fange feil før submit og bevare all utfylt data.
2. **Autocomplete** på «Eksisterende spiller»-oppslaget — i dag et bart e-postfelt; feiltasting → behandles som ukjent → invitasjon til feil adresse. Kapteinen skal kunne søke opp folk hen har spilt med før, på navn.
3. **Tydeligere «bli med»** — «Bli med på lag» ([TeamDashboardClient.tsx:123](app/signup/[shortId]/team/TeamDashboardClient.tsx)) og «Aksepter» forklarer ikke hva som skjer videre. Skal vise mode-aware neste-steg (open = med med en gang; manual_approval = venter på godkjenning).

## Beslutninger fra gray-area-diskusjon

- **Autocomplete-omfang = co-players.** Kandidatene begrenses til folk kapteinen har delt minst ett spill med (felles `game_players`-rader). Personvern-trygt — ingen preload av alle brukere (email-/navn-harvest-vektor på klubb-skala). Fri-tekst «Inviter via e-post» beholdes for alle andre.
- **«Venner» utsettes til eget issue.** Eieren vil ha et fullt venner-system (legg-til/godta venn) der venner også blir søkbare. Det er en egen epic. Kandidat-oppslaget bygges som **én resolver** (`getTeamCandidates`) slik at en framtidig venner-feature bare unioner inn i samme kilde uten å røre autocomplete-UI-et. Filed: [#408](https://github.com/jdlarssen/golf-app/issues/408).
- **Forslag-visning = navn + «kallenavn» + maskert e-post** (`ol•••@gmail.com`). Eieren aksepterte minst maskert. Etter valg vises en chip med navn + maskert e-post (ikke rå e-post dumpet i feltet).
- **Submit-blokkering:** ikke hard-disable knappen (a11y). Valider on-blur + ved submit-forsøk; ved ugyldig → vis inline-feil, fokuser første ugyldige felt, ikke kall server.

## Omfang

### Innenfor
- `app/signup/[shortId]/TeamRegistrationForm.tsx` — inline-validering + autocomplete-UI.
- `app/signup/[shortId]/page.tsx` — preload co-player-kandidater + kaptein-e-post, send som props.
- `app/signup/[shortId]/team/page.tsx` + `TeamDashboardClient.tsx` — mode-aware «bli med»/«aksepter»-copy (krever `registration_mode` som prop).
- Nye rene helpers: e-post-maskering + form-validatorer (Type A-testet).
- Ny server-resolver: `getTeamCandidates(userId)` (co-players; system-grense, ingen mock-tung unit-test).

### Utenfor (ikke bygg)
- Venner/friends-system (eget issue).
- Solo `RegistrationForm.tsx`.
- DB-migrasjoner / endring av tabeller.
- Endring av server-action-ens kjernelogikk (`submitTeamRegistration` o.l.) — kun additivt: siden preloader kandidater, copy passeres inn. Slot-payload (`{mode, value}`) holdes uendret; autocomplete-valg fyller `value` med valgt brukers e-post i `lookup`-modus.

## Akseptkriterier

- [ ] **K1 — Inline-validering:** Lag-navn (3–40 tegn) og hver medspiller-e-post valideres on-blur og ved submit-forsøk, med inline feilmelding per felt. Utfylt data bevares ved validerings- og submit-feil.
  - Evidens: kode-ref + vitest-test som viser inline-feil ved ugyldig e-post on-blur, og at felt-state består.
- [ ] **K2 — Submit-blokkering uten misvisende feil:** Klienten blokkerer submit når noe er ugyldig (ingen `team_name_invalid` fra server for en slot-feil). Første ugyldige felt får fokus. Dup-e-post og kaptein-egen-e-post fanges inline.
  - Evidens: vitest-test som verifiserer at `submitTeamRegistration` ikke kalles ved ugyldig input; dup/self gir inline-feil.
- [ ] **K3 — Autocomplete på co-players:** «Eksisterende spiller»-modus foreslår co-players mens kapteinen skriver (match på navn/kallenavn/e-post). Hvert forslag viser navn + «kallenavn» + maskert e-post. Valg fyller slot-en (vises som chip; submittes som `lookup` med brukers e-post).
  - Evidens: render-test + manuell/Playwright-verifikasjon av forslagsliste og valg.
- [ ] **K4 — Personvern + fallback:** Autocomplete-kandidatene er KUN co-players — ingen preload av alle brukere noe sted i klientbundelen. Fri-tekst «Inviter via e-post»-modus finnes fortsatt for folk utenfor lista.
  - Evidens: `getTeamCandidates` scoper på felles `game_players`; ingen full-users-fetch sendt til klient; email-mode beholdt.
- [ ] **K5 — Mode-aware «bli med»:** «Bli med på lag» (invited_unknown) og «Aksepter» (member) viser klar forklaring på neste steg, forskjellig for `open` (med i spillet med en gang) vs `manual_approval` (arrangør må godkjenne).
  - Evidens: kode-ref som viser mode-avhengig copy + test/snapshot eller render-test.
- [ ] **K6 — Gates grønne + versjon:** lint, tsc/build og co-located vitest grønne. `package.json` bumpet + `CHANGELOG.md`-oppføring per bruker-synlig commit.
  - Evidens: kommando-output.

## Gates

Kjør scoped til det som er endret:

```bash
npm run lint
npx tsc --noEmit
npx vitest run app/signup/[shortId]/TeamRegistrationForm.test.tsx \
  app/signup/[shortId]/team \
  lib/users   # nye helper-tester
npm run build   # før endelig evaluering (Vercel-paritet; fanger exhaustive-switch/Record-feil)
```

## Test-disiplin (per `docs/test-discipline.md`)

- **Type A (pure):** `maskEmail` (it.each), form-validatorer (`validateTeamName`, `validateSlotEmail`, dup/self-deteksjon). Assertion-rike.
- **Type C (UI):** Maks utvidelse av eksisterende `TeamRegistrationForm.test.tsx` med et lite, forsvarbart sett interaksjonstester (inline-feil on-blur, submit-blokkering, autocomplete-valg). Ikke re-assert tall fra Type A.
- **«Bli med»-copy:** mode-aware render-test i `TeamDashboardClient` (eller utvid eksisterende). Ikke assert på hele norske setninger der `data-testid`/rolle holder.
- **Ingen** mock-kopiering mellom filer; ingen «mens jeg var her»-tester.

## Versjonering

- K1–K4 (validering + autocomplete) = ny bruker-synlig kapabilitet → **MINOR**-bump.
- K5 («bli med»-copy) = polish av eksisterende → **PATCH**-bump.
- CHANGELOG-oppføring per commit per `docs/changelog-conventions.md`. Kjør `humanizer` på ny norsk copy før commit.

## Closing

Ved lukking: closing-kommentar på #362 med **Teknisk** + **Funksjonell** seksjon. Venner-issue ([#408](https://github.com/jdlarssen/golf-app/issues/408)) lenkes.
