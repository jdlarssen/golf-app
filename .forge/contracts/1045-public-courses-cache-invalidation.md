# Contract: #1045 — Tag-basert cache-invalidering for offentlige baner

Worktree: `.claude/worktrees/angry-yonath-43b162` · Branch: `claude/angry-yonath-43b162` (off origin/main @ faae28b8)
Issue: [#1045](https://github.com/jdlarssen/golf-app/issues/1045) `fix(courses)` · Milestone: Tier 1
Refs: #1021, #1023 (reverserer et bevisst v1-utsettelse-valg)

## Problem (verifisert mot koden)

`listPublicCourses()` og `getPublicCourseBySlug()` i `lib/courses/publicCourses.ts` er
`'use cache'` + `cacheLife('days')` UTEN tag. Ingen invalidering finnes → en ny/endret/
slettet bane treffer `/baner` først etter 24t revalidering (verste fall 7 dager expire).
Bekreftet: linje 107-109 og 178-179. `listPublicCourseSlugs()` delegerer til
`listPublicCourses()` (ikke selv cachet).

## Design

Reverser v1-utsettelsen — tag-basert invalidering, minimalt fotavtrykk:

1. **`lib/courses/publicCourses.ts`**: importer `cacheTag` fra `next/cache`. Legg
   `cacheTag('public-courses')` rett etter `cacheLife('days')` i BEGGE cachede
   funksjoner (`listPublicCourses`, `getPublicCourseBySlug`). `cacheLife` beholdes —
   tid-basert stale-grense + eksplisitt tag lever sammen (unchanged data forblir
   cachet, ingen per-request refetch). `listPublicCourseSlugs` trenger ingen egen tag
   (arver via delegasjon).

2. **Invalider `public-courses` etter HVER vellykket bane-mutasjon** med Next 16
   to-arg-formen `revalidateTag('public-courses', 'max')` (matcher etablert konvensjon,
   f.eks. `admin/formats/actions.ts`). Plasseres FØR `redirect()` (redirect kaster
   `NEXT_REDIRECT`, så alt etter den kjører ikke). Mutasjonssteder:
   - `app/[locale]/admin/courses/new/actions.ts` → `createCourse` (etter RPC-suksess)
   - `app/[locale]/admin/courses/[id]/edit/actions.ts` → `updateCourse` (etter RPC),
     `restoreTee` (etter tee-restore+audit — un-arkivering endrer aktiv-tee-antall og
     kan flippe eligibility, så den MÅ invalidere), `deleteCourse` (etter delete)

   Alle fire endrer bane/hull/tee, som alle inngår i `isPubliclyEligible` → alle
   invaliderer. Server-actions (ikke render-fase), så plain `revalidateTag` er trygt
   (ingen `after()`-wrapping nødvendig; den gjelder kun render-fase-kall).

## Success-kriterier

- [x] `cacheTag('public-courses')` i `listPublicCourses` + `getPublicCourseBySlug`; `cacheLife('days')` beholdt. → `publicCourses.ts:2,110,183`
- [x] `revalidateTag('public-courses', 'max')` i `createCourse`, `updateCourse`, `restoreTee`, `deleteCourse` — alle FØR redirect. → `new/actions.ts:87`, `edit/actions.ts:97,160,196`
- [x] Nyopprettet kvalifisert bane vises på `/baner` ved neste besøk etter lagring. → staging: opprettet «Cache-Test 1045» via admin-skjema (POST 303), dukket opp på `/baner` som «18 hull · 1 tee».
- [x] Endring som (u)kvalifiserer reflekteres raskt (samme `revalidateTag`-mekanisme i `updateCourse`/`restoreTee`, unit-dekket). Ikke separat staging-klikket — identisk kodesti som create/delete.
- [x] Sletting fjerner banen fra `/baner`. → staging: slettet «Cache-Test 1045» via `/slett` (POST 303), forsvant fra `/baner` (kun «Byneset North» igjen). Ryddet opp testbanen.
- [x] Ingen regresjon: uendret data forblir cachet — `cacheLife('days')` beholdt i begge lesere; prod-build viser `/sitemap.xml` fortsatt `1d 1w`.
- [x] Regresjonstest: hver mutasjons-action asserter `revalidateTag('public-courses', 'max')`; feilende/blokkerte stier asserter at den IKKE kalles. → `new/actions.test.ts` + `edit/actions.test.ts`, 29 tester grønne.

**Caveat (staging dev-modus):** `torny-staging` kjører `next dev`; dev holder ikke den døgn-lange `'use cache'`-en som prod gjør, så «før-fiks = stale»-tilstanden kan ikke reproduseres i dev. Positive kriterier (create→vises, delete→forsvinner, ingen runtime-feil) er demonstrert; den endelige prod-bekreftelsen er deploy-en (buster cachen → Miklagard blir synlig umiddelbart, per issue-bonus).

## Gates

- `npx tsc --noEmit` (eller `npm run build` for exhaustive-switch-fangst) — grønt
- `npm run lint` — grønt på berørte filer
- `npx vitest run app/\[locale\]/admin/courses lib/courses/publicCourses.test.ts` — grønt
- Version-bump: `fix` → patch (`npm version patch --no-git-tag-version`) + CHANGELOG Feilrettinger-linje (bruker-synlig)
- Staging-klikkrunde: opprett/rediger/slett bane → verifiser `/baner` oppdateres umiddelbart

## Notater

- Bruker-synlig fix → CHANGELOG Feilrettinger-linje påkrevd (ikke `[no-changelog]`).
- Bonus (fra issue): selve deployen buster cachen → Miklagard blir synlig umiddelbart.
- Copy: ingen ny norsk bruker-copy i denne endringen → humanizer N/A.
