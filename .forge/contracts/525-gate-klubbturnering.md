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

- [ ] `lib/clubs/isClubAdminAnywhere.ts` finnes; returnerer true for owner/admin i ikke-utløpt klubb, false ellers/ved feil.
- [ ] Klubb-flisen er SKJULT for vanlig bruker (ikke-admin, ikke-klubb-admin) i `/opprett-spill`-veiviseren.
- [ ] Klubb-flisen er SYNLIG for global admin.
- [ ] Klubb-flisen er SYNLIG for klubb-admin (owner/admin i klubb) uten global admin.
- [ ] Klubb-flisen forblir synlig ved redigering av eksisterende klubb-spill (`value === 'klubb'`).
- [ ] `PLAYER_COUNT_MAX === 24` i GameWizard; stepperen går til 24 i kompis.
- [ ] Format-grid på 17–24 spillere er ikke tomt (stableford/slagspill).
- [ ] Kompis-copy oppdatert (ikke «2–4 venner»), kjørt gjennom humanizer.
- [ ] IntentSelector render-test utvidet (Type C, samme fil): klubb skjult/synlig per rolle + edit-flyt.
- [ ] Versjon bumpet + CHANGELOG-oppføring.

## Gates

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run build` — Compiled successfully (Vercel-paritet)
- [ ] `npx vitest run app/admin/games/new/IntentSelector.test.tsx lib/wizard/fitsPlayerCount` — grønt
- [ ] Co-located test for endrede filer grønt
- [ ] commit-msg-hook passerer (versjons-bump + CHANGELOG staged)

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
