# Kontrakt: #615 — Handicap-format i admin-spillerliste

## Problem

`/admin/spillere` viser handicap via `u.hcp_index.toFixed(1)` ([PlayersList.tsx:94](app/[locale]/admin/spillere/_components/PlayersList.tsx:94)). To feil:

1. **Desimalskille:** `toFixed` gir alltid punktum («12.2»), uavhengig av locale. Norsk bruker komma («12,2»), og resten av appen (Hjem, Profil) viser komma.
2. **Fortegn:** Plusshandicap (bedre enn scratch) lagres som et NEGATIVT tall (−8.0). `toFixed(1)` viser da «−8.0», men golf-konvensjonen er «+8,0» (plusshandicap skrives med pluss).

## Tilnærming

Lag en ren, locale-bevisst display-helper `formatHcpDisplay(signed, locale)` i `lib/handicap/sign.ts` (co-located med `fromSignedHcp`/`formatGolfboxHcp`). Den komponerer eksisterende byggeklosser:

- `fromSignedHcp(signed)` → `{ magnitude, isPlus }` (allerede brukt i Profil)
- `formatNumber(magnitude, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })` fra `lib/i18n/format.ts` (locale-bevisst desimalskille + bevart én-desimal-presisjon)
- plusshandicap → prefiks `+`, scratch (0) → ingen prefiks

Hvorfor ny helper og ikke bare `formatGolfboxHcp`: den hardkoder norsk komma (`.replace('.', ',')`) og garanterer ikke én desimal — den gir «+8», ikke «+8,0», og bryter i engelsk modus. `formatHcpDisplay` er locale-korrekt begge veier.

Wire `formatHcpDisplay(u.hcp_index, locale)` inn i `PlayersList.tsx`; locale via `getLocale()` fra `next-intl/server` (etablert mønster i søster-server-komponenter).

### Bevisst utenfor scope (ikke gold-plate)

- **Profil** bruker fortsatt `formatGolfboxHcp` (norsk-komma hardkodet) → viser «12,4» også i engelsk modus. Det er en separat latent i18n-rest etter #60, ikke #615. Flagges, fikses ikke her.
- Ingen migrering av andre handicap-visningsflater.

## Suksesskriterier

- [ ] **K1** — Ny ren helper `formatHcpDisplay(signed: number, locale: AppLocale): string` i `lib/handicap/sign.ts`: locale-bevisst desimalskille, alltid én desimal, `+`-prefiks for plusshandicap (lagret negativ), ingen prefiks for scratch (0).
- [ ] **K2** — Co-located Type A-tester i `lib/handicap/sign.test.ts` dekker: vanlig hcp norsk komma («12,2»), plusshandicap «+8,0» (input −8), scratch «0,0» (input 0, ingen pluss), heltalls-magnitude «25,0», engelsk punktum («12.2» / «+8.0»). Alle grønne.
- [ ] **K3** — `PlayersList.tsx` bruker `formatHcpDisplay(u.hcp_index, locale)` i stedet for `u.hcp_index.toFixed(1)`; locale hentet via `getLocale()`.
- [ ] **K4** — Norsk modus viser «12,2» og «+8,0»; engelsk modus («/en») viser «12.2» og «+8.0». (Helper-test beviser logikken; build grønn beviser wiring.)
- [ ] **K5** — Versjonsbump (PATCH, bruker-synlig fix) + CHANGELOG-oppføring i samme commit.

## Gates

- `npx vitest run lib/handicap/sign.test.ts lib/i18n/format.test.ts` — grønn
- `npx tsc --noEmit` — ingen nye feil
- commit-msg-hook: `fix(...)` krever `package.json`-bump + `CHANGELOG.md` (håndheves automatisk)

## Filer som forventes endret

- `lib/handicap/sign.ts` (ny helper)
- `lib/handicap/sign.test.ts` (nye Type A-cases)
- `app/[locale]/admin/spillere/_components/PlayersList.tsx` (wiring + locale)
- `package.json` + `CHANGELOG.md` (PATCH-bump)
