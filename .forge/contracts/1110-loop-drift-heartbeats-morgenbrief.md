# Spec: Loop-drift — månedlig arkiv-hjem + konsistent arkiveringsregel

**Issue:** #1110 · **Branch:** claude/1110-loop-drift-heartbeats-morgenbrief

## Problem

#1110 er den pinnede «Loop-drift»-tavla for de selvkjørende loopene (epic #1073) — den lever allerede og tar imot heartbeats fra Nattkjøreren og Dok-avstemmeren pluss den daglige Morgenbriefen (verifisert i kommentarene på issuet i dag, 2026-07-07). Alle konvensjonene i issue-body-en er allerede implementert i `docs/loops/{nattkjoreren,morgenbriefen,dok-avstemmeren,ci-vakta}.md` (levert med natt-duoen). Selve tavla er altså ferdig; **issuet er ikke en feature å bygge, men et levende driftsdokument som arkiveres månedlig og aldri lukkes.**

Det ene som er *beskrevet, men ikke realisert*, og som dessuten er selvmotsigende, er den månedlige arkiveringen:

- `docs/loops/logg/`-katalogen finnes ikke (bekreftet: `git ls-files docs/loops/` viser ingen `logg/`-filer; katalogen mangler helt). Første måneds-arkivering (tidlig august 2026) har altså ingen definert destinasjon.
- Issue-body-en sier arkivet skjer «til `docs/loops/logg/` **og nullstilles**», mens `docs/loops/morgenbriefen.md:89-94` (§«Månedlig arkivering») sier det motsatte: «Arkiverte kommentarer **kan ikke redigeres bort** fra #1110; lenk til arkivfila i briefen i stedet.» To hjem for samme regel som er uenige (AGENTS.md trap 4).

Denne kontrakten lukker det gapet: etablerer arkiv-hjemmet og gjør arkiveringsregelen entydig, slik at Morgenbriefens første-brief-i-måneden-steg har en klar, uimotsagt prosedyre å følge.

## Design

Ren docs-endring (intern devx, ikke bruker-synlig). Ingen kode, ingen DB, ingen migrasjon.

1. **Opprett arkiv-hjemmet `docs/loops/logg/README.md`.** Git sporer ikke tomme kataloger, så en README er både indeks og eksistens-anker. Innhold:
   - Hva katalogen er: månedlige snapshot av #1110-tavla, én fil per måned med navnekonvensjon `<år>-<måned>.md` (f.eks. `2026-07.md`) — samme mønster som `docs/loops/morgenbriefen.md:92` allerede refererer.
   - Regelen for arkivering (append-only): kommentarer på #1110 slettes ALDRI; en måneds-fil er et lesbart snapshot av forrige måneds kommentarer, og briefen lenker til arkivfila. «Nullstilling» betyr at Morgenbriefens delta-baseline nullstilles for den nye måneden — ikke at issuet tømmes for kommentarer.
   - At #1110 er et levende driftsdokument som forblir åpent (aldri `Closes`), pinnet, milestone #13.
   - Kopier-lim-klar `gh`-oppskrift for hvordan Morgenbriefen (LLM-routine, kjører `gh`-kommandoer — ikke et kompilert skript) henter forrige måneds kommentarer: `gh api repos/jdlarssen/golf-app/issues/1110/comments --jq '.[] | select(.created_at | startswith("<år>-<måned>"))'` → skriv til `docs/loops/logg/<år>-<måned>.md` via draft-PR eieren merger.

2. **Fjern selvmotsigelsen (AGENTS.md trap 4 — én regel, ett hjem, endre alle lag i én commit).** To berørte lag:
   - **Issue-body #1110:** «Issuet arkiveres månedlig til docs/loops/logg/ og nullstilles.» → omformuler til å matche append-only-sannheten, f.eks.: «Månedlig snapshotter Morgenbriefen forrige måneds kommentarer til `docs/loops/logg/<år>-<måned>.md` (via draft-PR); kommentarene på issuet blir stående, briefens delta-baseline nullstilles for ny måned.» Endres med `gh issue edit 1110 --body-file <fil>` (bash-guard krever `--body-file`/`--body`, ikke inline med trigger-substrings — jf. hook-guard-notatet). **Merk:** hovedchatten, ikke byggeren, eier issue-redigering per forge-arbeidsflyten — hvis byggeren ikke skal røre GitHub-issuet, la body-endringen stå som eksplisitt oppgave til hovedchatten i closing-kommentaren og gjør kun docs-endringen. (Se Key Decisions.)
   - **`docs/loops/morgenbriefen.md:89-94`:** presiser samme ordlyd, og legg til én linje som peker på `docs/loops/logg/README.md` som kilde for navnekonvensjon + `gh`-oppskrift (så prosedyren ikke er duplisert to steder — README er sannhetskilden, morgenbriefen.md lenker dit).

3. **Ingen andre loop-docs endres.** `nattkjoreren.md:76`, `dok-avstemmeren.md:89`, `ci-vakta.md:112` refererer #1110 kun for heartbeat-posting — de rører ikke arkivering og skal stå urørt (I4: scope = task).

Fordi endringen er intern (ikke bruker-synlig): commit-prefiks `docs`, som passerer version-bump-hooken fritt — **ingen** `package.json`-bump, **ingen** CHANGELOG-linje. Commit-body må ha `Refs #1110` (commit-msg-hook). Åpne PR mot main med `Part of #1110` i body (IKKE `Closes` — #1110 er en levende tavle som ikke skal auto-lukkes; jf. MEMORY «Closes #N closes the whole epic»-fella). Docs-only → ingen staging-verify påkrevd.

## Key Decisions

- **#1110 forblir åpen.** Tavla arkiveres og gjenbrukes månedlig; den lukkes aldri. PR-en bruker `Part of #1110`, aldri `Closes`.
- **Append-only vinner over «nullstilles».** `morgenbriefen.md` sin eksisterende regel («kan ikke redigeres bort») er den bevisste designbeslutningen (arkiv-integritet). Issue-body-ens «nullstilles» er den upresise formuleringen som rettes — ikke omvendt.
- **README er sannhetskilden for arkivprosedyren**; morgenbriefen.md lenker dit i stedet for å duplisere navnekonvensjon + `gh`-oppskrift (unngår ny drift mellom to hjem).
- **Ingen automatiserings-skript.** Loopene er LLM-routines som kjører `gh`-kommandoer; en dokumentert `gh`-oppskrift dekker behovet uten ny vedlikeholdsplikt (epic #1073: «eieren får ingen nye vedlikeholdsplikter»).

**Claude's Discretion:** eksakt ordlyd i README og i den rettede morgenbriefen-passasjen; om `docs/loops/logg/` skal ha en `.gitkeep` i tillegg til README (README alene holder); presis form på `gh`-oppskriften; hvorvidt issue-body-redigeringen (steg 2, første kule) utføres av byggeren eller delegeres til hovedchatten som eksplisitt oppgave i closing-kommentaren.

## Success Criteria

- [ ] `docs/loops/logg/README.md` finnes, sporet av git, og dokumenterer: navnekonvensjon `<år>-<måned>.md`, append-only-regelen, at #1110 forblir åpen, og en kopier-lim-klar `gh`-oppskrift for å hente en måneds kommentarer.
- [ ] `docs/loops/morgenbriefen.md` §«Månedlig arkivering» er konsistent med README (ingen «kan ikke redigeres bort» vs. «nullstilles»-motsigelse igjen) og lenker til README som prosedyrekilde.
- [ ] #1110 body og morgenbriefen.md sier det samme om hva «arkivering» innebærer (append-only snapshot + delta-baseline-reset, ikke kommentar-sletting) — enten fikset direkte eller eksplisitt delegert til hovedchatten i closing-kommentaren.
- [ ] Ingen endring i `nattkjoreren.md`, `dok-avstemmeren.md`, `ci-vakta.md` eller annen kode; diffen er docs-only.
- [ ] Motsigelsen er borte: `git grep -n "redigeres bort" docs/loops/morgenbriefen.md` viser den omformulerte append-only-ordlyden (ikke lenger i konflikt med issue-body), og `gh issue view 1110 --json body` bekrefter at «og nullstilles» er erstattet — eller at erstatningen er delegert til hovedchatten i closing-kommentaren. (Merk: «nullstilles» bor kun i GitHub-issue-body-en, ikke git-sporet, så `git grep "nullstilles"` treffer bare urelaterte forekomster; frasen «kan ikke redigeres bort» brytes over morgenbriefen.md-linje 93–94, så et rått `git grep "kan ikke redigeres bort"` matcher aldri — grep på «redigeres bort» i stedet.)

## Gates

- [ ] `git status` / `git diff --stat` bekrefter docs-only (kun `docs/loops/logg/README.md` ny + `docs/loops/morgenbriefen.md` endret).
- [ ] `git grep -n "docs/loops/logg"` — alle referanser peker på en katalog som nå eksisterer.
- [ ] Commit-msg-hook grønn (`Refs #1110` i body; `docs`-prefiks → ingen bump/CHANGELOG krevd).
- [ ] Ingen `npm run build`/`vitest`/staging-verify nødvendig (docs-only, ikke bruker-synlig) — men bekreft eksplisitt at ingen `.ts/.tsx`-fil er rørt.

## Files Likely Touched

- `docs/loops/logg/README.md` — nytt arkiv-hjem: navnekonvensjon, append-only-regel, `gh`-oppskrift, «#1110 forblir åpen».
- `docs/loops/morgenbriefen.md` — §«Månedlig arkivering» (linje 89-94) gjøres konsistent + lenker til README.
- (utenfor repoet, evt. hovedchat-oppgave) #1110 issue-body via `gh issue edit 1110 --body-file` — retter «og nullstilles»-ordlyden.

## Out of Scope

- Å bygge loop-routines på nytt eller endre heartbeat-/brief-atferd (allerede levert i natt-duoen; #1110-konvensjonene er implementert).
- Automatiserings-skript eller GitHub Action for arkivering (bevisst droppet — LLM-routine + `gh`-oppskrift dekker det).
- Å lukke #1110 (levende tavle — forblir åpen).
- Sletting/redigering av eksisterende kommentarer på #1110 (append-only er regelen).
- Endringer i `nattkjoreren.md`, `dok-avstemmeren.md`, `ci-vakta.md`, CI-vakta-heartbeat-unntaket eller Discord-speilingen.
