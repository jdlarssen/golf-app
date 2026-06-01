# Forge-evaluering: Avslutt-likevel når en spiller ikke har levert (#375)

**Verdikt: ACCEPT**

Branch: `claude/modest-wilbur-c4cc7b` · Evaluert 2026-06-01 · Skeptisk, kode lest direkte + alle gates kjørt.

Alle seks akseptkriterier er oppfylt med kildebevis, og alle fire gates passerer. Ingen blokkerende bugs funnet. Én avvik fra commit-planen (kosmetisk) noteres under.

## Per-AC-tabell

| AC | Status | Bevis (file:line) |
|---|---|---|
| **AC1 — Kan avslutte med no-show** | PASS | Detalj-siden eksponerer escapen: `onlyMissingBlocks = players.length > 0 && notSubmittedCount > 0 && pendingApprovalCount === 0` (`app/admin/games/[id]/page.tsx:475-476`), som rendrer «Avslutt likevel →»-lenke (`page.tsx:921-936`) til `avsluttLikevelHref` (`page.tsx:480-482`). I `endGame` hopper loopen genuint over no-shows uten redirect når `allowMissing`: `if (!p.submitted_at) { if (!allowMissing) redirect(...); continue; }` (`app/admin/games/[id]/actions.ts:299-307`), så flyter videre til `status='finished'`-flippen (`actions.ts:313-316`). Force-test grønn (se gate 1). |
| **AC2 — Ser hvem som mangler** | PASS | Ikke-sideturnering: `avslutt-likevel/page.tsx:85-91` bygger `missing`-liste fra `!gp.submitted_at`, rendret som `<ul>` med navn (`avslutt-likevel/page.tsx:119-123`). Sideturnering: `avslutt/page.tsx:96-100` bygger samme liste, vist i advarsel med navn over vinner-skjemaet (`avslutt/page.tsx:115-133`). Navn bruker nickname/email-fallback (begge sider). |
| **AC3 — Markeres «ikke fullført», ikke levert** | PASS | Ingen `game_players`-UPDATE finnes i noen av end-stiene — kun `games.update({status:'finished', ended_at})` (`actions.ts:313-316`, `avslutt/actions.ts:169-172`). `submitted_at` skrives aldri for no-shows. Roster-branch: `if (!p.submitted_at) { if (game.status==='finished') statusLabel='Ikke fullført'; else statusLabel='⏳ Spiller'; }` (`page.tsx:721-730`) — «Ikke fullført» kun ved finished && !submitted_at. Force-testen asserter finished-redirect uten noen submit-write (`actions.test.ts:202-219`). |
| **AC4 — Aldri permanent låst** | PASS | Force-lenke vises alltid når levering er eneste blokker (`onlyMissingBlocks`, `page.tsx:475-476`, 921). Sideturnering + missing dead-ender ikke: lenken går til `/avslutt` (`page.tsx:480-482`), wizarden binder `allowMissing = missing.length > 0` (`avslutt/page.tsx:102`) og `SideWinnersForm`-submit kaller actionen med formData → `endGameWithSideWinners` hopper over no-shows (`avslutt/actions.ts:137-142`). Begge sider har vei til `finished`. |
| **AC5 — Bump + CHANGELOG** | PASS | `package.json` version = `1.64.0`. CHANGELOG har `## 1.64.y`-tema + `### [1.64.0] - 2026-06-01`-oppføring med tagline + Teknisk-details. Bump + CHANGELOG staget i samme `feat(admin)`-commit (`7a3f1c6`) som UI-en — commit-msg-hook passerte (commiten eksisterer). |
| **AC6 — Flyt 5 oppdatert** | PASS | `docs/flows/05-kjor-og-avslutt-spill.svg` (i-dag-flyten) endret: tekst gikk fra «krever at alle har levert (og evt. er godkjent)» → «alle levert (og evt. godkjent), eller «avslutt likevel» når noen mangler» (commit `761199e`). PNG regenerert (binær diff 355498→361492 bytes). Riktig at i-dag-SVG-en (ikke `-fremtid`) endres siden featuren nå finnes i prod. |

## Bug-hunt (skeptiske sjekker fra oppdraget)

Alle gjennomgått — ingen blokkerende funn:

1. **`.bind(null, gameId, missing.length>0)`-argrekkefølge:** KORREKT. `endGameWithSideWinners(gameId, allowMissing, formData)` (`avslutt/actions.ts:47-51`) binder de to første args; `SideWinnersForm` kaller `action(formData)` (`SideWinnersForm.tsx:16,29`), som lander som tredje arg. React server-action form-konvensjon ivaretatt.
2. **Happy-path uendret:** BEKREFTET. `everyPlayerReady`-grenen (`page.tsx:902-920`) bruker `EndGameButton`; non-side submitter `endGame(gameId)` med `allowMissing=false` default, side-spill rutes til `/avslutt` der `missing.length===0` → `allowMissing=false`, ingen advarsel. Default-stien er bit-for-bit som før.
3. **`allowMissing` × `require_peer_approval`:** KORREKT bevart. Selv med `allowMissing=true` blokkerer en submitted-men-ikke-godkjent fortsatt: `if (game.require_peer_approval && !p.approved_at) redirect(not_all_approved)` kjøres etter `continue` for no-shows (`actions.ts:308-310`, `avslutt/actions.ts:143-145`). Dekket av eksplisitt test (`actions.test.ts:337-382`). Dessuten vises force-lenken aldri når `pendingApprovalCount > 0` (`page.tsx:476`), så admin når ikke engang force-siden med ventende godkjenninger.
4. **`onlyMissingBlocks`-loop/dead-end:** INGEN. `avslutt-likevel/page.tsx` redirecter sideturnering→`/avslutt` (`:64-66`) og no-missing→detalj (`:94-96`); begge er defensive for direkte-URL og fører ikke i sirkel (detaljsiden viser da normal `everyPlayerReady`-knapp).

## Avvik fra contract (ikke-blokkerende)

- **Commit-struktur:** Contract-en planla 3 commits (#1: `refactor(admin): thread allowMissing` plumbing-only, #2: `feat`, #3: `docs(flows)`). As-built har 2 commits: `feat(admin)` (`7a3f1c6`, slo plumbing + UI sammen) + `docs(flows)` (`761199e`). Funksjonelt identisk; ingen AC påvirkes. Kun audit-granularitet, ikke et kvalitetsproblem.

## Gate-output

### Gate 1 — `npx vitest run "app/admin/games/[id]/actions.test.ts"` → GRØNN
```
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  394ms
```
Inkluderer: force-sti-test (`allowMissing=true` flipper til finished, ingen submit-write), default-blokk-test (`not_all_submitted`), peer-approval-håndhevelse (`not_all_approved`), happy path, off-app mail-gating, auth/authz-gates.

### Gate 2 — `npx tsc --noEmit` → REN
```
TSC_EXIT=0
```

### Gate 3 — `npm run build` → GRØNN
```
✓ Compiled successfully in 2.6s
```
Ny rute i manifestet:
```
├ ƒ /admin/games/[id]/avslutt
├ ƒ /admin/games/[id]/avslutt-likevel
```
Eneste warning er den pre-eksisterende «inferred workspace root»-lockfile-advarselen (urelatert til denne featuren). Ingen exhaustive-switch/Record-feil.

### Gate 4 — commit-msg-hook → PASSERTE
`feat(admin)`-commiten (`7a3f1c6`) staget `package.json` (version-bump til 1.64.0) + `CHANGELOG.md` sammen med UI-en; hooken ville blokkert ellers. Commiten eksisterer i historikken → hook passerte.
