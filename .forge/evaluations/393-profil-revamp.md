# Evaluering: #393 — Profil-revamp

VERDICT: ACCEPT

Evaluert mot `.forge/contracts/393-profil-revamp.md`, commits `0098efa..HEAD`
(`0868735` scaffolding, `389e7a4` feature, `7e18997` docs).

## Auth-gate-begrensning (eksplisitt)

`/profile` er auth-gated: `getProxyVerifiedUserId()` → `redirect('/login')` før
side-kroppen rendres (page.tsx:65–68). Ingen testkrediter finnes, så
Playwright/preview kan IKKE rendre den innloggede profil-layouten. UI-kriteriene
(K1, K2, K4) er derfor verifisert **strukturelt** (JSX render-tre + Tailwind-klasser)
og via prod-build, ikke via visuelt screenshot. Ingen visuell verifikasjon påstås.

## Per-kriterium

| K | Verdict | Evidens |
|---|---------|---------|
| K1 | PASS | page.tsx:124–138 — én `<SettingList>` med 4 `SettingRow` + `<InstallButton/>` (som selv rendrer én rad). De gamle full-høyde-seksjonene `HistorikkCard` (base:298) og `GdprSection` (base:344) finnes i `0098efa` men er fjernet i HEAD. `grep -rn "HistorikkCard\|GdprSection" app/ components/` → ingen treff. Ingen dead code. |
| K2 | PASS | page.tsx:166–168 — `<Button type="submit" variant="secondary">Logg ut</Button>`. Button.tsx:15–16: `secondary` = `bg-transparent border border-border hover:bg-primary-soft text-text` (outline, ikke primær fyll). Ingen `w-full`/`className` → auto-bredde. Separator over: `border-t border-border/60 pt-6` (page.tsx:164). |
| K3 | PASS | `grep -c "Avbryt" app/profile/ProfileFormBody.tsx` → `0`. `SmartLink`-import fjernet (diff: `-import { SmartLink } ...`, ingen `SmartLink` igjen i fila). «Lagre» beholdt (ProfileFormBody.tsx:41). Skjult `next`-input bevart (linje 77). Build grønn ⇒ ingen unused-import. |
| K4 | PASS | page.tsx:114–118 — `<InviteAFriendCard>` (Card) rett etter `ProfileFormCard`, før settings-lista. Åpent kort, ikke kollapset. Tettere: header `mb-3` + `mb-0.5`, form `space-y-3` (var `space-y-4`), fjernet `mt-2` på knapp og hjelpetekst (InviteFriendForm-diff). |
| K5 | PASS | Alle mål nåbare med korrekte hrefs/actions: historikk `/profile/historikk` (125), statistikk `/profile/statistikk` (126), install via `<InstallButton/>` onClick → native `install()` eller modal (InstallButton.tsx:19–25), eksport `/profile/export` med `download` (128–132), slett `/profile/slett-konto` (133–137), logout `<form action="/logout" method="post">` (165), personvern `/legal/privacy` (145). |
| K6 | PASS | page.tsx:133–137 — `SettingRow href="/profile/slett-konto" tone="danger"`. Ren navigasjon til dedikert side; ingen inline-confirm, ingen `<details>`-popout. Følger prosjektregelen om dedikerte confirm-sider for destruktive handlinger. |
| K7 | PASS | Se gate-output under. ESLint 0 errors, vitest 18/18, build EXIT=0. |

## Gate-output

**1. ESLint** (`npx eslint app/profile components/ui/SettingRow.tsx components/pwa/InstallButton.tsx`):
```
app/profile/statistikk/page.tsx
  226:27  warning  'userId' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
```
0 errors. Den ene warning-en er i `statistikk/page.tsx` (ikke i de endrede filene) og er pre-eksisterende — eksplisitt akseptabel per kontrakt. PASS.

**2. Vitest** (`npx vitest run app/profile components/ui/SettingRow`):
```
Test Files  3 passed (3)
      Tests  18 passed (18)
```
PASS.

**3. Build** (`npm run build`): `EXIT=0`, ingen type-/RSC-feil. Autoritativ typecheck grønn. PASS.

## SettingRow separator/first-child-logikk

Granskede risiko: bryter den selv-skjulende `InstallButton`-raden divider-/`first:`-logikken?

- Separator = `border-t border-border first:border-t-0` per rad-element (SettingRow.tsx:21).
- DOM-barn av `SettingList`-div (lukket modal-state): `a`(historikk), `a`(statistikk), `button`(install — når vist), `a`(export), `a`(slett). Fragmentet fra `InstallButton` er DOM-transparent; barna blir direkte søsken.
- `InstallInstructionsModal` returnerer `null` når lukket (InstallInstructionsModal.tsx:30), så `InstallButton` bidrar med nøyaktig ÉN DOM-node (button-raden) i default-state — ikke en ekstra node som kan stjele `:first-child`.
- Første rad (historikk) er ubetinget og alltid først → `first:border-t-0` treffer den korrekt i alle tilstander.
- Når install-raden self-hider (`null`): statistikk→export blir naboer, hver tegner egen `border-t`. Ingen dobbel-border, ingen manglende topp-border på reell første-rad.
- Modal kan ikke stjele `:first-child`: den er fixed overlay og uansett siste barn av sitt Fragment.

Konklusjon: logikken er korrekt.

## Norsk copy

- CHANGELOG-tagline (1.68.2): idiomatisk, action-orientert, ingen AI-tells. OK.
- Nye labels: «Mer» (micro-label), «Installer som app», «Eksporter mine data», «Min historikk», «Klubbstatistikker», «Slett konto». Kontrakten skrev «Installer app»/«Eksporter data»; implementasjonen bruker litt mer eksplisitte former («som app», «mine data») — ingen regresjon, mer naturlig norsk. CHANGELOG nevner «app-installering». OK.

## Out-of-scope-respekt

Endrede filer i range: kun `app/profile/{page,ProfileFormBody,InviteFriendForm}.tsx`,
`components/pwa/InstallButton.tsx`, `components/ui/SettingRow.{tsx,test.tsx}`,
`CHANGELOG.md`, `package.json(+lock)`, `.forge/contracts/...`. Ingen `/invite`-side,
ingen `lib/`-/scoring-endringer, ingen endring i slett-konto/eksport/historikk-sidene
selv, ingen accordion, ingen bunn-nav-endring. Out-of-scope respektert.

## Versjonering

`package.json` → `1.68.2` (PATCH-bump fra 1.68.1, korrekt for bruker-synlig polish).
CHANGELOG har korrekt tre-lags 1.68.2-oppføring under 1.68.y-temaet. Scaffolding-commit
`refactor(ui)` uten bump, feature-commit `feat(ui)` med bump — matcher kontraktens
versjons-disiplin og hook-håndhevingen.

## Funn

Ingen. Alle K1–K7 PASS, alle gater grønne, scope respektert.
