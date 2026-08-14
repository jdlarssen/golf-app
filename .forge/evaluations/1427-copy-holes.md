# Evaluering: copy-hull 1427 — runde 1

Verdikt: **ACCEPT**

Evaluert 2026-08-15 av fersk-kontekst forge-evaluator på branch `claude/1427-copy-holes`
(HEAD `7700edfd`, diffet mot `origin/main`). Alle kriterier verifisert med egne kommandoer.

## Per kriterium

| Kriterium | Status | Evidens |
|---|---|---|
| `no.json` sier «roterende»; EN-søster uendret | ✅ | `python3`-parse: NO wolf.shortDescription = «4 spillere, roterende Wolf. …»; EN = «4 players, the Wolf rotates. …». Diff-hunken i `messages/en.json` rører KUN `landing.endCta` — wolf-nøkkelen er urørt. |
| EN `landing.endCta.*` gir hel setning med ikke-tomt gullord | ✅ | Begge kataloger parser som gyldig JSON. pre+gold+post = «Fire up your golf tournament in a par of minutes» (gold = `par`, ikke-tom). Speiler NO: «Fyr opp golfturneringen på et par minutter». |
| Ingen test-/snapshot-oppdatering; 0 test-treff på strengene | ✅ | Grep over `*.test.*`/`*.spec.*`/`*.snap`: null treff på «rotereende», «roterende Wolf», «par of minutes», «headingGold». Mail-testenes «couple of minutes»-treff kommer fra egne nøkler (`mail.common.tagline`/`footerTagline`, `leaderboard.shareCard.tagline` m.fl.) — verifisert uendret i en.json, IKKE fra `landing.endCta`. Ingen test-/snap-filer i diffen; `vitest -u` er ikke kjørt. Bekreftet grønt: 7 i18n-relaterte testfiler + `lib/mail/inviteNotification.test.ts` (237 tester passert). |
| `.changes/1427-copy-hull.md` (type fix) | ✅ | Finnes; frontmatter kun `type: fix` + `issue: 1427` (ingen ekstra nøkler, riktig for fix — ingen title/link/cta); brødtekst 111 tegn ≤400, én setning i changelog-stemme. Filnavn følger `<issue>-<slug>.md`. |
| Humanizer-sjekk på ny EN-copy | ✅ | Prosess-kriterium — verifisert ved inspeksjon: «Fire up your golf tournament in a par of minutes» har ingen AI-tells (ingen rule-of-three, ingen inflatert symbolikk); typo-fiksen er ett ord. Commits passerte pre-commit-hooken uten bypass (bash-guard blokkerer `--no-verify`). |
| Staging-bevis + `staging-verified`-label FØR ready | ✅ | PR #1645 er fortsatt **draft** (riktig per #1516), har `staging-verified`-label, og bevis-kommentar fra jdlarssen med orakel-tabell (Struktur-orakel / Feillogg / SQL-orakel): `end-cta-gold` count=1 tekst `par`; `format-desc` på Wolf-flis `hasTypo=false`/`hasFixed=true`; prod-vakt `prodHits=[]`, staging-mintet OTP. |
| Gate | ✅ | `npx vitest run` på i18n-testene: 237/237 grønne. `npx tsc --noEmit`: exit 0. (Katalog-parse verifisert direkte med python3 i tillegg.) |

## Tilleggssjekker

- **`## Produktvalg`-heading ordrett i PR-body:** ✅ — `gh pr view 1645 --json body` viser eksakt `## Produktvalg` (maskin-markøren per #1630); auto-merge hindres. Full A/B-seksjon med fordeler/ulemper, ombyggingskostnad (liten), reversibilitet (full) og svar-instruks — følger PR-presentasjonsformen fra #1413.
- **Scope:** ✅ — diffen rører nøyaktig 6 filer: `messages/no.json`, `messages/en.json`, `.changes/1427-copy-hull.md`, `.forge/contracts/1427-copy-holes.md`, samt `app/[locale]/AnonLanding.tsx` og `app/[locale]/admin/games/new/FormatGrid.tsx` — de to siste er rene `data-testid`-tillegg (`end-cta-gold`, `format-desc`) som staging-beviset bruker. Ingen scope-kryp.
- **Commits:** ✅ — `9d6c69bd fix(i18n): wolf typo and missing gold word in English landing CTA` med `Refs #1427` i body; `7700edfd chore(e2e)` og `ade1754c chore(forge)` har også `Refs #1427`. Fix-commiten bærer notatfilen (commit-msg-hooken tilfredsstilt).
- **Utenfor scope respektert:** ✅ — hvorfor-torny-sidens endCta og øvrige formatGuide-tekster urørt (diff-hunkene bekrefter).

## Konklusjon

Kontrakten er oppfylt i sin helhet. PR #1645 står korrekt som draft med produktvalget
åpent for eieren (A bygget og staging-verifisert; B beskrevet med liten ombyggingskostnad).
Ingen funn.
