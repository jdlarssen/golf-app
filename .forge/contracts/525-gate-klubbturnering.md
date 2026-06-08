# Spec: Gate Klubbturnering til klubb-eiere + hev offentlig kompis-tak til 24 (#525)

**Issue:** [#525](https://github.com/jdlarssen/golf-app/issues/525)
**Branch:** `claude/crazy-saha-1feb5e`
**Type:** feat (område: admin — opprett-spill-veiviser)
**Versjon:** minor → `1.106.0` (gating) + patch `1.106.1` (tak+copy), nestet under samme tema

## Problem

Veiviseren viser i dag «Klubb-turnering»-flisen til ALLE innloggede brukere. Den er bygd rundt en ekte klubb (roster fra klubbmedlemmer, `group_id`, synlig for hele klubben), så en bruker uten klubb treffer bare en blindvei. «Solo / test» ble gatet til admin i #477 — klubb skal gates på samme måte, men til **admin + klubb-admin** (en klubb-eier som ikke er global admin beholder tilgang).

Å gjemme klubb etterlater et hull for en større ad-hoc-gjeng (12–24). Det løses ved å heve det offentlige Kompis-taket fra 16 → 24; format-grid-et smalner seg selv inn til stableford/slagspill over 16 (verifisert i `fitsPlayerCount`), så «turnering-følelsen» kommer gratis uten en femte fane.

## Prior Decisions (brainstorm 2026-06-08)

- Gate klubb til **admin ELLER klubb-admin** (owner/admin i ≥1 ikke-utløpt klubb). Ikke kun global admin.
- Behold flisen synlig ved redigering av eksisterende klubb-spill (`value === 'klubb'`), speiler #477-presedensen.
- Hev Kompis-tak til **24**, behold navnet «Kompis-runde». Ingen «Stor turnering»-fane (YAGNI).
- Cup røres IKKE her (motsatt retning — åpnes for alle i #526).

## Design

### 1. `isClubAdmin`-signal (ny server-helper)

Ny `lib/clubs/isClubAdminAnywhere.ts` (speiler `getClubMemberPlayerOptions`: admin-client, best-effort → `false` ved feil):

```ts
export async function isClubAdminAnywhere(userId: string): Promise<boolean>
```
Spør `group_members` for `user_id = userId` med `role IN ('owner','admin')`, join `groups(valid_until)`, returner `true` hvis ≥1 ikke-utløpt klubb (`!isClubExpired`).

### 2. IntentSelector-filter (`app/admin/games/new/IntentSelector.tsx`)

Ny prop `isClubAdmin?: boolean` (default `false`). Utvid filteret:
```ts
const canCreateClubGame = isAdmin || isClubAdmin;
const tiles = TILES.filter(
  (tile) =>
    (tile.intent !== 'solo' || isAdmin || value === 'solo') &&
    (tile.intent !== 'klubb' || canCreateClubGame || value === 'klubb'),
);
```
Oppdater JSDoc med #525.

### 3. Prop-flyt (`GameWizard.tsx` + begge server-sider)

- `GameWizard`: ny prop `isClubAdmin?: boolean` (default `false`), send til begge `IntentSelector`-bruk (~459, ~513).
- `app/opprett-spill/page.tsx` (GameFormBody): beregn `isClubAdminAnywhere(userId)` (parallelt i `Promise.all`), send `isClubAdmin`.
- `app/admin/games/new/page.tsx`: admin-gatet (redirect ellers), `isAdmin` er true → `canCreateClubGame` true uansett. La `isClubAdmin` defaulte (ikke send).

### 4. Hev tak (`GameWizard.tsx:1176`)

`PLAYER_COUNT_MAX = 24` (var 16). Stepperen er kompis-only (klubb går via roster) → taket gjelder bare offentlig kompis. `fitsPlayerCount` urørt (stableford/slagspill `n>=1`, grid aldri tomt på 17–24).

### 5. Copy (`lib/wizard/intent.ts`)

- `INTENT_DESCRIPTIONS.kompis`: fra `'2–4 venner som vil gjøre runden mer spennende'` → ny tekst som reflekterer opp til 24. Kjør `humanizer` (unngå em-dash-kjede).
- `INTENT_DESCRIPTIONS.klubb`: vurder å understreke klubb-tilhørighet (nå gatet klubb-vei). Kjør `humanizer`.

## Edge Cases & Guardrails

- Klubb-eier uten global admin: ser klubb (canCreateClubGame). Plain medlem (role=member): ser IKKE klubb.
- Utløpt klubb som eneste klubb: `isClubAdminAnywhere` = false → klubb skjult (ClubPicker ville uansett vært tom). Ønsket.
- Redigering av klubb-spill: flisen vises (`value === 'klubb'`) selv for ikke-klubb-admin.
- Admin-siden: `isAdmin` true → klubb alltid synlig.
- 17–24 spillere: format-grid viser stableford/slagspill (ikke tomt).

## Success Criteria

- [x] `lib/clubs/isClubAdminAnywhere.ts` finnes; true for owner/admin i ikke-utløpt klubb, false ellers/ved feil. **Evidence:** ny fil (`a727872`), `role IN ('owner','admin')` + `isClubExpired`-filter, best-effort → false.
- [x] Klubb-flisen SKJULT for vanlig bruker. **Evidence:** test «#525: vanlig bruker ... ser bare Kompis + Cup» grønt; filter `tile.intent !== 'klubb' || canCreateClubGame || value === 'klubb'`.
- [x] Klubb-flisen SYNLIG for global admin. **Evidence:** `canCreateClubGame = isAdmin || isClubAdmin`; test «admin ser alle fire» grønt; admin-side sender `isAdmin`.
- [x] Klubb-flisen SYNLIG for klubb-admin uten global admin. **Evidence:** test «#525: klubb-admin ser Klubb-turnering uten å være global admin» grønt.
- [x] Klubb-flisen synlig ved redigering (`value === 'klubb'`). **Evidence:** test «#525: et eksisterende klubb-spill viser fortsatt kortet i edit-flyten» grønt.
- [x] `PLAYER_COUNT_MAX === 24`. **Evidence:** `GameWizard.tsx:1186` (`73da7eb`); stepper `Math.min(24, …)`.
- [x] Format-grid på 17–24 ikke tomt. **Evidence:** `fitsPlayerCount.ts:26-29` (`n >= 1` for stableford-familien); slagspill via permissiv `default: true`.
- [x] Kompis-copy oppdatert + humanizer. **Evidence:** `intent.ts:34` «Gjør runden mer spennende, opp til 24 spillere»; humanizer-skill kjørt på begge strenger.
- [x] IntentSelector render-test utvidet (Type C, samme fil). **Evidence:** +3 tester, 12/12 grønt.
- [x] Versjon bumpet + CHANGELOG. **Evidence:** `1.106.0` + `1.106.1`, ny `1.106.y`-tema, forrige serie kollapset.

## Gates

- [x] `npm run build` — Compiled successfully (Vercel-paritet) i worktree. (`tsc --noEmit` ga kun stale `.next`-validator-feil for renamet `spillformer`-rute — urelatert; build er autoritativ.)
- [x] `npx vitest run app/admin/games/new/IntentSelector.test.tsx lib/wizard/fitsPlayerCount.test.ts` — 127/127 grønt
- [x] Co-located test for endrede filer grønt (IntentSelector.test.tsx)
- [x] commit-msg-hook passerer — begge `feat`-commits hadde versjons-bump + CHANGELOG staget

## Files Likely Touched

- `lib/clubs/isClubAdminAnywhere.ts` (ny)
- `app/admin/games/new/IntentSelector.tsx` (filter + prop + JSDoc)
- `app/admin/games/new/IntentSelector.test.tsx` (utvid render-test)
- `app/admin/games/new/GameWizard.tsx` (prop-flyt + `PLAYER_COUNT_MAX`)
- `app/opprett-spill/page.tsx` (beregn + send `isClubAdmin`)
- `lib/wizard/intent.ts` (copy)
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Cup (åpnes for alle i #526 — motsatt retning).
- Klubb-opprettelses-UI for vanlige brukere (#480-territorium).
- `fitsPlayerCount`-cap-endringer på parti-formater (de skal falle ut over 16).
