# Forge-kontrakt: Peer-godkjenning — synliggjør admin-overstyring (#360)

**Issue:** [#360](https://github.com/jdlarssen/golf-app/issues/360)
**Branch:** `claude/laughing-dhawan-4bb519`
**Flyt:** 5 — Kjør og avslutt spill (`docs/flows/05-kjor-og-avslutt-spill*.svg`); funnet i flyt 3-audit
**Bump:** PATCH (fjerner en blindvei / UX-fix, overstyringen finnes alt) → `1.65.0` → `1.65.1`

## Problem

Når `require_peer_approval = true` venter et levert scorekort på godkjenning
fra en i flighten. Forsvinner en peer (drar hjem, glemmer det), er det ingen
**oppdagbar** vei til å løse opp kortet fra admin-flaten. Overstyringen finnes
allerede teknisk (`adminApproveScorecard`, rendret som «Godkjenn på vegne av
flight»-knapp i «Leverte scorekort»-kortet), men **«Avslutt spillet»-kortet er
en blindvei**: når `pendingApprovalCount > 0` viser det bare en passiv advarsel
(«N scorekort venter på godkjenning») uten handling eller peker
(`app/admin/games/[id]/page.tsx:985–998`). Arrangøren ser at noe blokkerer, men
ikke at hen selv kan løse det. Speilbilde av #375 (leverings-lås), men for
godkjenning — #375 lot bevisst denne sperra stå til #360.

## Prior Decisions (videreført)

- **#375 (avslutt-likevel):** `allowMissing`-escapen lemper KUN leverings-sperra;
  `not_all_approved` forblir en hard sperre eid av #360. «Avslutt likevel»-lenka
  vises kun når levering er ENESTE blokker (`pendingApprovalCount === 0`). →
  Konsekvens her: når BÅDE levering OG godkjenning blokkerer, må arrangøren først
  godkjenne de ventende kortene (nå signpostet), så dukker «Avslutt likevel» opp.
  Sekvensiell opplåsing, ingen ny kombinert flyt trengs.
- **#386 (WD):** trukne spillere er ute av `rankablePlayers` og teller aldri som
  ventende godkjenning. Uendret her.
- **Destruktive handlinger = egen side** (memory). Men admin-godkjenning er en
  **overstyring**, ikke destruktiv, og dagens mønster for nettopp denne handlingen
  er inline `window.confirm` (`ApprovePlayerButton`). Vi holder oss til det —
  ingen dedikert side (brukeren valgte «kun per kort»).

## Beslutninger (avklart med bruker 2026-06-01)

1. **Overstyring = kun per kort** (brukervalg). Behold dagens per-kort-knapp
   «Godkjenn på vegne av flight». Ingen bulk «godkjenn alle»-knapp, ingen egen
   side. Den eneste endringen er å **fjerne blindveien** — avslutt-kortet peker
   tydelig til overstyringen.
2. **Ingen tids-basert auto-eskalering / cron / push-varsel.** Brukeren:
   *«veldig sjeldent mer enn 5–10 minutter før godkjent; mer enn timer/dager er
   høyst usannsynlig»*. En daglig cron-purring er nytteløs på et minutt-vindu, og
   proaktiv admin-purring overlapper uansett #376. «Auto-eskalering» reduseres til
   at overstyringen er **umiddelbart og tydelig tilgjengelig** idet et kort er
   ventende — som dekker begge akseptkriteriene. Dokumentert i «Ikke i scope».

## Design

Alt skjer i `app/admin/games/[id]/page.tsx` (server-component) — ingen nye
server-actions, ingen DB-endring, ingen nye notification-kinds.

**1. Anker på «Leverte scorekort»-kortet.** `SectionCard` (lokal komponent,
linje 1069) får en valgfri `id?: string`-prop som settes på `<section>`. Gi
«Leverte scorekort»-kortet (linje 829) `id="leverte-scorekort"` så avslutt-kortet
kan deeplinke dit. «Leverte scorekort» renderes ALLTID over avslutt-kortet i
DOM når et kort er levert, så et `#`-anker scroller oppover til knappene.

**2. Avslutt-kortet er ikke lenger en blindvei.** I `else`-grenen (linje 985–998),
når `pendingApprovalCount > 0`: bytt den passive advarselen ut med en handlings-
rettet melding som forklarer at arrangøren kan godkjenne på vegne av flighten, med
en anker-lenke til `#leverte-scorekort`. Gjelder begge varianter:
   - **Kun godkjenning blokkerer** (`notSubmittedCount === 0 && pendingApprovalCount > 0`):
     egen variant av avslutt-kortet (i dag faller den til `else`-blindveien).
   - **Både levering og godkjenning blokkerer:** vis begge linjer; godkjennings-
     linja får samme signpost. (Når godkjenning er løst → `onlyMissingBlocks` slår
     inn → «Avslutt likevel» dukker opp.)

   Copy-skisse (norsk, kjør `humanizer` før commit):
   > «{N} scorekort venter på godkjenning fra flighten. Får ikke en medspiller
   > godkjent, kan du godkjenne på vegne av flighten i **Leverte scorekort** over.
   > Da kan spillet avsluttes.» + lenke «Til leverte scorekort ↑»

**3. Flyt 5-diagram.** Sjekk om `05-kjor-og-avslutt-spill*.svg` viser godkjennings-
lås som blindvei/⚠. Hvis ja: oppdater (regenerer PNG per `docs/flows/README.md`) i
samme PR. Hvis ikke representert: ingen diagram-endring (noter i closing).

## Edge Cases & Guardrails

- **Submitter trukket etter levering:** vises i «Leverte scorekort»-lista
  (filtrerer ikke WD) men teller IKKE i `pendingApprovalCount` (bruker
  `rankablePlayers`). Avslutt-kortet skal ikke blokkere på en trukket — uendret,
  ingen regresjon.
- **`require_peer_approval = false`:** `pendingApprovalCount === 0` alltid →
  signpost-grenen trigges aldri. Ingen endring for det vanlige (post-#371) spillet.
- **Anker uten match:** hvis «Leverte scorekort» ikke renderes (umulig når
  pendingApprovalCount > 0, men defensivt) faller `#`-lenka bare til toppen — ingen
  feil.
- **Mobil (primær plattform):** anker-scroll oppover skal lande på et synlig kort;
  ingen sticky-header som skjuler målet (verifiser i preview).

## Success Criteria

- [ ] **AC1 — Aldri permanent låst.** Et levert-men-ugodkjent kort kan alltid
  løses opp av arrangøren mens spillet er aktivt (per-kort «Godkjenn på vegne av
  flight» finnes + virker). *(Bevis: `adminApproveScorecard`-grenen i
  `actions.test.ts` grønn; knappen rendres for `needsApproval`-kort.)*
- [ ] **AC2 — Oppdagbar vei fra spill-detaljsiden.** Avslutt-kortet er ikke lenger
  en blindvei: når godkjenning blokkerer, peker det tydelig til overstyringen med
  anker-lenke til «Leverte scorekort». *(Bevis: `page.tsx` else-gren rendrer
  signpost + `<a href="#leverte-scorekort">`; ingen ren passiv advarsel igjen for
  `pendingApprovalCount > 0`.)*
- [ ] **AC3 — Anker virker.** «Leverte scorekort»-kortet har `id="leverte-scorekort"`;
  lenka scroller dit. *(Bevis: `id`-attributt i DOM; preview-snapshot/klikk.)*
- [ ] **AC4 — Ingen regresjon i kombinert blokker.** Når både levering og
  godkjenning blokkerer vises begge, og når godkjenning løses dukker «Avslutt
  likevel» opp (onlyMissingBlocks). *(Bevis: les grenene; manuell/preview-sjekk.)*
- [ ] **AC5 — Bump + CHANGELOG.** PATCH → `1.65.1` + CHANGELOG-oppføring i samme
  commit som UI-en. *(Bevis: commit-msg-hook passerer.)*

## Gates (scoped til det som endres)

1. `npx vitest run "app/admin/games/[id]/actions.test.ts"` → grønn (ingen action-regresjon)
2. `npx tsc --noEmit` → ingen feil (ny `id?`-prop på SectionCard typer rent)
3. `npm run build` → grønn
4. `.githooks/commit-msg` passerer (bump + CHANGELOG staget på fix-commit)
5. Preview (frontend touched): admin game-detail med et aktivt spill der et kort
   venter godkjenning → avslutt-kortet viser signpost + anker scroller til
   «Leverte scorekort». Snapshot som bevis.

## Files Likely Touched

- `app/admin/games/[id]/page.tsx` — `id?`-prop på `SectionCard`; `id="leverte-scorekort"`;
  signpost-gren i avslutt-kortet (erstatter blindvei) for både ren- og kombinert-blokker.
- `package.json` + `CHANGELOG.md` — PATCH-bump `1.65.1` + oppføring.
- `docs/flows/05-kjor-og-avslutt-spill*.svg` (+ `.png`) — KUN hvis godkjennings-lås
  vises som blindvei i diagrammet.

## Ikke i scope (unngå gold-plating)

- **Tids-basert auto-eskalering / cron / push-varsel** — descopet per bruker
  (minutt-vindu gjør timed purring nytteløs; overlapper #376 admin-purring).
- **Bulk «godkjenn alle gjenstående»-knapp** — brukeren valgte «kun per kort».
- **Egen «løs opp godkjenning»-bekreftelsesside** — overstyringen er ikke destruktiv;
  inline `window.confirm` er etablert mønster for denne handlingen.
- **Nye tester** — copy/link/UI-endring; ingen ny logikk. Per test-disiplin gir
  copy-endringer ikke nye tester. Eksisterende `actions.test.ts` dekker actionen.
- **Endre `adminApproveScorecard` / `reopenScorecard`** — virker som de skal.

## Commit-plan

1. `fix(admin): vis vei til å godkjenne på vegne av flighten fra avslutt-kortet`
   — `SectionCard` `id`-prop + anker + signpost-gren + PATCH-bump + CHANGELOG
   (én atomisk bruker-synlig commit).
2. `docs(flows): ...` — KUN hvis flyt 5-diagrammet trenger oppdatering.
