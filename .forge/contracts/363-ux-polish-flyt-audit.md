# Spec: UX-polish — tre konsistens-fikser fra flyt-audit

Issue: #363 (`enhancement`, `area:admin`, `area:courses`). Samlepost, lav alvor. Flyt-audit `docs/user-flows.md` (#9). Tre uavhengige fikser, atomiske commits per fiks, én PR.

## Problem
Tre konkrete inkonsistenser fra flyt-auditen:
1. **Trusted-creator redirect-bounce:** etter opprett-spill redirecter de delte create-actionene til `/admin/games/${id}` ([`actions.ts:226`](app/admin/games/new/actions.ts)). For en trusted-non-admin (fra `/opprett-spill`) bouncer admin-layouten dem videre til `/` — de havner aldri på spillet sitt.
2. **Bane-sletting mangler confirm-side:** sletting skjer inline via `DeleteCourseButton` (`window.confirm`) på edit-siden, mens spill/spiller har dedikerte `/slett`-sider. Bryter den dokumenterte regelen «destruktive admin-handlinger får alltid en dedikert `/slett`-rute, aldri inline/`window.confirm`».
3. **Ingen aktiv-spill-nudge på Hjem:** pågår en runde, er den bare ett kort blant flere i «Mine spill».

## Prior Decisions
- **Destruktive handlinger → dedikert side** (hard regel): aldri `<details>`-popout eller inline-toggle/`window.confirm`. Alltid en `/slett`-rute som spill (`app/admin/games/[id]/slett/`) og spillere.
- **#198 trusted-creator MVP:** `/opprett-spill` gjenbruker admin-create-actionene; den aksepterte «rough edge» (bounce) er nettopp det denne fiksen lukker.
- **#346 «én dør per rom»:** create-flyten er allerede konsolidert; vi endrer kun hvor trusted creator LANDER, ikke inngangen.

## Design
**Fiks 1 — trusted creator lander på `/games/[id]`:**
De delte actionene (`createAndPublishGame`/`createGameDraft`, `app/admin/games/new/actions.ts`) kjenner allerede creatorens rolle (auth-helper returnerer `isAdmin`/`isTrusted`). Endre den avsluttende redirecten: admin → `/admin/games/${id}?status=...` (uendret); trusted-non-admin → `/games/${id}` (game-home, spiller-visningen — de ER en spiller). Cup-grenen (`/admin/cup/...`) er admin-only og uendret.

**Fiks 2 — dedikert `/admin/courses/[id]/slett`-side:**
Ny side som speiler games-`/slett`-mønsteret: `requireAdminOrTrustedCreator` (samme gate som edit-siden), hent banen, tell barn-rader (course_holes + tee_boxes) for «Slettes permanent»-lista, danger-knapp (form → `deleteCourse`), Avbryt → tilbake til edit. **In-use-håndtering:** tell games som refererer banen; er den i bruk → vis blokkerende banner («Banen er i bruk i N spill og kan ikke slettes») og render IKKE delete-knappen (pre-empter `deleteCourse` sin `in_use`-redirect). Erstatt `DeleteCourseButton` på edit-siden med en `SmartLink` til `/slett`; slett den nå ubrukte `DeleteCourseButton.tsx`. `deleteCourse`-action uendret (beholder in_use/ownership/cascade-guards + redirects).

**Fiks 3 — «Pågår nå»-seksjon på Hjem:**
I `app/page.tsx` (has-games-grenen): splitt `activeGames` i `inProgress = status === 'active'` og resten. Render en egen «Pågår nå»-seksjon ØVERST (over «Mine spill») når `inProgress.length > 0`, med aksent-markering (accent-ramme på kortet). «Mine spill» viser de resterende (planlagte) spillene. Gjenbruk eksisterende kort-markup.

## Edge Cases & Guardrails
- **Fiks 1:** admin-flyten må forbli uendret (`/admin/games/[id]`). Kun trusted-non-admin omdirigeres. Draft + publish + cup-grener håndteres riktig.
- **Fiks 2:** in-use bane → blokker i UI (ingen delete-knapp) OG `deleteCourse` beholder sin server-side `in_use`-guard (defense-in-depth). Trusted-non-admin som ikke eier banen → `deleteCourse` redirecter `not_owned` (uendret). Cascade (holes+tees) skjer via FK — confirm-lista nevner det.
- **Fiks 3:** ingen pågående spill → ingen «Pågår nå»-seksjon (ikke en tom heading). Tom-tilstand (ingen spill i det hele tatt) uendret. Avsluttede spill uendret.
- **Generelt:** ikke rør games/players `/slett`-sidene, ikke rør `deleteCourse`-guards, ikke rør create-action-validering (kun den siste redirecten).

## Key Decisions
- **Trusted creator → `/games/[id]`** (issue-option, gjenbruker game-home) framfor en ny kvitteringsside.
- **In-use bane blokkeres i confirm-UI**, ikke bare server-side — bedre enn å la brukeren klikke og bounce til lista med feil.
- **«Pågår nå» som egen seksjon øverst** (eier-valg) framfor sortering-i-lista.
- **PATCH-bump:** tre konsistens/polish-fikser — brukeren gjør det samme som før, bare ryddigere/tryggere.

**Claude's Discretion:**
- Eksakt aksent-styling på «Pågår nå»-kortet + seksjons-heading-tekst.
- Copy på course-slett-siden (warning, in-use-banner, knapp-label) — kjøres gjennom `humanizer`.
- Om trusted-redirecten dropper `?status=`-paramet (game-home bruker det ikke).

## Success Criteria
- [ ] Trusted-non-admin creator lander på `/games/[id]` etter opprett (ikke `/admin/games/[id]`→bounce); admin lander fortsatt på `/admin/games/[id]` — lesing + test.
- [ ] Bane-sletting går via dedikert `/admin/courses/[id]/slett`-side (speiler games-`/slett`); inline `window.confirm`-`DeleteCourseButton` er fjernet — lesing.
- [ ] Course-slett-siden viser barn-rad-tellere (hull + tees) og blokkerer (ingen delete-knapp) når banen er i bruk i spill — lesing.
- [ ] Hjem viser en egen «Pågår nå»-seksjon øverst med status=active-spill; øvrige spill blir i «Mine spill»; ingen seksjon når ingen pågår — lesing.
- [ ] Ingen regresjon: `deleteCourse` sine in_use/ownership/cascade-guards intakt; games/players `/slett` urørt — lesing/test.

## Gates
- [ ] `npx tsc --noEmit` passerer
- [ ] `npx vitest run app/admin/games/new/actions.test.ts "app/admin/courses/[id]/edit/actions.test.ts"` passerer
- [ ] `npx eslint` på endrede filer passerer
- [ ] `npm run build` passerer (ny rute kompilerer)
- [ ] `feat`/`fix`-commit: PATCH-bump `package.json` + `CHANGELOG.md`
- [ ] Playwright/preview **waived**: admin/trusted-gated flater + game-home krever autentisert state lokal preview ikke når. Verifiseres via kode + test; eier spot-sjekker i prod.

## Files Likely Touched
- `app/admin/games/new/actions.ts` — trusted-non-admin redirect → `/games/[id]`.
- `app/admin/games/new/actions.test.ts` — test for trusted vs admin redirect-target.
- `app/admin/courses/[id]/slett/page.tsx` — NY confirm-side.
- `app/admin/courses/[id]/edit/page.tsx` — erstatt `DeleteCourseButton` med lenke til `/slett`.
- `app/admin/courses/[id]/edit/DeleteCourseButton.tsx` — slett (ubrukt etter endring).
- `app/page.tsx` — «Pågår nå»-seksjon.
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring under 1.68.y.

## Out of Scope
- Endre `deleteCourse`-actionens guards/oppførsel (kun flytte confirm til dedikert side).
- Games/players `/slett`-sidene.
- Andre flyt-audit-funn (#357/#367/#368 allerede shippet; #393 profil-revamp eget issue).
- Egen kvitteringsside for trusted creator (game-home er nok).
- Realtime/sortering utover active-vs-resten på Hjem.
