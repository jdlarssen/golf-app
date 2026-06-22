# Spec: Fjern «trusted creator»-rollen — kun admin eller spiller (#898)

**Issue:** [#898](https://github.com/jdlarssen/golf-app/issues/898)
**Branch:** `issue-898-remove-trusted-creator`
**Milestone:** Backlog. Forutsetning for #892.

## Problem

Eier-beslutning 2026-06-22: vi går bort fra «trusted creator»-halvrollen. To roller fremover: **admin** (`users.is_admin`) eller **spiller** (alle andre). Flere admins kan komme senere — kun `is_admin = true`, ingen ny maskineri. Trusted-creator var en kode-allowlist (én bruker: `fornes.even@yahoo.no`) som ga to ekstra ting utover vanlig spiller: bane-**styring** (`/admin/courses`) og admin-**påmeldinger** (`/admin/games/[id]/signups`). Opprettelse av spill (`/opprett-spill`) og bane (`/opprett-bane`) er allerede all-player og berøres ikke.

## Prior Decisions (denne sesjonen)

- **fornes.even@yahoo.no → vanlig spiller.** Ingen promotering til admin. Når allowlista slettes reverteres brukeren automatisk — **ingen DB-endring**. Baner de eier består; kun admin styrer dem fremover.
- **Sekvensering:** dette bygges FØR #892 (som antar to-rolle-modellen). #863 + #897 er allerede merget til main.

## Design

Ren refaktor: fjern allowlist + `isTrusted`, og gjør de to trusted-gatede flatene admin-only. `requireAdminOrTrustedCreator` → `requireAdmin` på alle call-sites. `role.isTrusted` brukes kun ett sted utenom auth.ts (TilesGrid Baner-tile) — den greinen fjernes.

### Exact edits (verifisert mot kode på branch-base)

**Slett:**
- `lib/admin/trustedCreators.ts`
- `lib/admin/trustedCreators.test.ts`

**`lib/admin/auth.ts`:**
- Fjern `import { isTrustedCreator } from './trustedCreators';` (linje 3).
- Fjern `isTrusted: boolean;` fra `AdminRoleContext` (linje 18).
- I `loadRole`: fjern `isTrusted: isTrustedCreator(email),` (linje 41).
- `requireAdmin` (linje 75): `if (!ctx.isAdmin) redirect(ctx.isTrusted ? '/admin' : '/');` → `if (!ctx.isAdmin) redirect('/');`. Oppdater JSDoc-en over `requireAdmin` (fjern «Trusted creators → /admin»-punktet).
- Fjern hele `requireAdminOrTrustedCreator`-funksjonen (linje 79–85).

**Bytt `requireAdminOrTrustedCreator` → `requireAdmin` (import + kall):**
- `app/[locale]/admin/courses/page.tsx` (import :14, kall :56)
- `app/[locale]/admin/courses/new/page.tsx` (:11, :22)
- `app/[locale]/admin/courses/[id]/edit/page.tsx` (:22, :93)
- `app/[locale]/admin/courses/[id]/slett/page.tsx` (:5, :45)
- `app/[locale]/admin/courses/[id]/edit/actions.ts` (:8, og 3 kall :15/:130/:201 — `const role = await requireAdmin(supabase)`; `role` brukes kun for `userId`, ikke `isTrusted`, så swappen er trygg)
- `app/[locale]/admin/games/[id]/signups/page.tsx` (:5, :86)
- `app/[locale]/admin/games/[id]/signups/actions.ts` (:8, :65; oppdater også kommentarene :17/:69 som nevner «trusted creators» → «admin»)

**`app/[locale]/admin/TilesGrid.tsx` (PlayerKlubbhus, ~:265):**
- Fjern `const banerTile: Tile = role.isTrusted ? {label, href:'/admin/courses', meta: t('playerBanerTrustedMeta'), icon} : {…href:'/opprett-bane'…}` — erstatt med ÉN tile: alltid `/opprett-bane`, meta `t('playerBanerMeta')`. Behold ikon `'bane'`. Den nå-ubrukte i18n-nøkkelen `playerBanerTrustedMeta` kan fjernes fra begge locales (valgfritt — ufarlig å la stå; hvis fjernet, fjern i BÅDE no.json og en.json for paritet).

**Tester (fjern trusted-case, behold admin/ikke-admin):**
- `lib/admin/auth.test.ts` — fjern isTrusted/requireAdminOrTrustedCreator-cases.
- `app/[locale]/admin/courses/[id]/edit/actions.test.ts`
- `app/[locale]/admin/games/new/actions.test.ts` (refererer trusted)
- `app/[locale]/admin/games/[id]/signups/actions.test.ts`

**Docs:**
- `docs/user-flows.md`: fjern «Trusted creator (e-post-allowlist)»-halvrollen (linje ~10) + referanser i §0-mermaid (PlayerKlub-noden) og §A1 («vanlig spiller / trusted creator»→«vanlig spiller»). To roller.

## Edge Cases & Guardrails

- **Authz:** `/admin/courses/*` og `/admin/games/[id]/signups` blir admin-only. Verifiser at en vanlig spiller som deep-linker bouncer (requireAdmin → `/`). Game-/bane-OPPRETTELSE (`/opprett-spill`, `/opprett-bane`) er IKKE trusted-gated og skal fortsatt virke for alle spillere.
- **Ingen RLS/skjema-endring.** Vi endrer kun hvem som når admin-UI-et; RLS-laget (bane insert-own #366, course/signup write-policies) er uendret og forblir sikkerhets-grensen.
- `role`-objektet fra `requireAdmin` har samme form som før minus `isTrusted` — bekreft at ingen call-site leser `role.isTrusted` etter endringen (grep skal være tom).
- Ikke rør `requireAdmin`s øvrige callers eller andre gates (`requireAdminOrCreator`, `requireAdminOrClubAdmin*` osv.) — de bruker ikke `isTrusted`.

## Key Decisions

- `requireAdminOrTrustedCreator` → `requireAdmin` (ikke en ny «admin-or-anything»-gate) — flatene skal være rene admin-only.
- fornes.even håndteres ved å slette allowlista (ingen DB-touch).

**Claude's Discretion:**
- Om `playerBanerTrustedMeta`-nøkkelen fjernes eller beholdes (hvis fjernet: begge locales).
- Eksakt JSDoc-ordlyd i `auth.ts` etter forenkling.

## Success Criteria

- [ ] **K1** — `lib/admin/trustedCreators.ts` (+ test) slettet; `grep -rn "isTrusted\|isTrustedCreator\|requireAdminOrTrustedCreator\|TrustedCreator" app lib` (uten node_modules) er TOM.
- [ ] **K2** — `/admin/courses/*` (page/new/edit/slett/edit-actions) og `/admin/games/[id]/signups` (page+actions) gater nå med `requireAdmin`.
- [ ] **K3** — `PlayerKlubbhus` Baner-tile peker alltid på `/opprett-bane`; ingen `role.isTrusted`-grein.
- [ ] **K4** — `AdminRoleContext` har ikke `isTrusted`; `requireAdmin` redirecter ikke-admin til `/` (ingen isTrusted-grein); `requireAdminOrTrustedCreator` finnes ikke.
- [ ] **K5** — `docs/user-flows.md` beskriver to roller (ingen trusted-halvrolle).
- [ ] **K6** — Berørte tester grønne uten trusted-case; i18n-paritet holder (hvis `playerBanerTrustedMeta` fjernet, fjernet i begge).

## Gates

```bash
npx tsc --noEmit
npx vitest run lib/admin "app/[locale]/admin/courses" "app/[locale]/admin/games"
npm run build
npm run lint
```

- **Version:** ren intern refaktor for hele bruker-basen (kun den ene allowlist-brukeren mister admin-UI-tilgang, en bevisst tilgangsreduksjon, ikke en feature). Bruk `refactor(...)`-prefiks → **ingen bump, ingen CHANGELOG-oppføring**. (Commit-msg-hooken slår kun på feat/fix/perf.)
- **humanizer:** kun hvis ny norsk copy legges til (lite forventet).

## Files Likely Touched

- `lib/admin/trustedCreators.ts` (+ test) — slett
- `lib/admin/auth.ts` (+ `lib/admin/auth.test.ts`)
- `app/[locale]/admin/courses/{page,new/page,[id]/edit/page,[id]/edit/actions,[id]/slett/page}.tsx/.ts` (+ edit/actions.test)
- `app/[locale]/admin/games/[id]/signups/{page.tsx,actions.ts}` (+ signups/actions.test, games/new/actions.test)
- `app/[locale]/admin/TilesGrid.tsx`
- `messages/no.json` + `messages/en.json` (kun hvis `playerBanerTrustedMeta` fjernes)
- `docs/user-flows.md`

## Out of Scope

- Ingen RLS/skjema-endring.
- Ingen admin-administrasjons-UI (å gjøre noen til admin er fortsatt `users.is_admin = true` direkte — egen sak hvis ønsket).
- Ingen endring i game-/bane-opprettelsesflyt for spillere.
- #892 (spiller-Klubbhus-redesign) — eget issue, bygges etter dette.
