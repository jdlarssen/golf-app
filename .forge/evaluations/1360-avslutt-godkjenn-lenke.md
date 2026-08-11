# Evaluering: Lenk godkjennings-overriden fra avslutt-blindveien (#1360)

- **Dato:** 2026-08-11
- **Branch:** `claude/1360-avslutt-godkjenn-lenke`
- **Commit:** c714ec54 (`fix(game): link the approval override from the creator finish dead-end`)
- **Evaluator:** fersk-kontekst forge-evaluator (runde 2, uavhengig verifikasjon)

## Per suksesskriterium

### 1. Ny lenke + ny setning på /avslutt, navigasjon scroller til #leverte-scorekort — PASS

Kode verifisert: `app/[locale]/games/[id]/avslutt/page.tsx:163-168` — ny `Link` med
`href={`${detailPath}/spillere#leverte-scorekort`}` og `t('approveOverrideCta')`, plassert
FØR «Tilbake til spillet»-lenken (:169-174), identisk pill-stil, `min-h-[44px]`.
Ankeret finnes: `app/[locale]/games/[id]/spillere/page.tsx:375` — `<section id="leverte-scorekort">`,
rendret når `awaitingApproval.length > 0` (:211-214: `isActive && require_peer_approval &&
submitted_at && !approved_at && !withdrawn_at` — samme predikat som avslutt-sidens
unapproved-gren, så seksjonen finnes garantert når lenken vises).
Staging-evidens etterprøvd: skjermbildene `1360-avslutt-mobile.png` og
`1360-spillere-mobile-scrolled.png` funnet i øktas scratchpad og inspisert visuelt —
avslutt-siden viser note + lenke i riktig rekkefølge med footer **v1.232.1**
(branch-build, ikke prod), spillere-siden er synlig scrollet (heading klippet i toppen)
med «Venter på godkjenning»-seksjonen og «Godkjenn på vegne av flight»-knappen i viewport.
Tallene i kontrakten (scrollY 33, top=362/667, tap-target 50px) er spesifikke,
ikke-runde og konsistente med skjermbildene.
**Forbehold:** kontrakten hevder skjermbildene er «postet på PR #1568» — det stemmer ikke
(PR-en har per evaluering kun én Vercel-bot-kommentar). Se funn 1.

### 2. Nøkler i både no.json og en.json, paritet, ingen hardkodet norsk — PASS

Verifisert via node: `game.finish.approveOverrideNote` + `approveOverrideCta` finnes i
begge locales (`messages/no.json:2016-2017`, `messages/en.json:2016-2017`). Dørnavnet
matcher faktisk label (`managePlayersLink` = «Styr spillere» / «Manage players», :1866
i begge). Guillemets i en.json er husets konvensjon (flere eksisterende treff).
Gate kjørt selv (Node v22.23.0): `npx vitest run messages/catalogParity.test.ts
messages/apostropheParity.test.ts` → **2 filer / 4 tester PASS**. Rendring via
`t('approveOverrideNote')` / `t('approveOverrideCta')` (namespace `game.finish`,
avslutt/page.tsx:55) — ingen hardkodet norsk.

### 3. Stale-kommentaren presisert — PASS

`avslutt/page.tsx:109-111`: ny kommentar nevner at endGame avviser ugodkjente kort og at
overriden på /spillere (#429) er den sanksjonerte utveien. Matcher kontraktens ordlyd.

### 4. `fix` + patch-bump + CHANGELOG — PASS

Commit c714ec54 er `fix(game): …`; `package.json` 1.232.0→1.232.1 (patch, riktig for fix);
CHANGELOG-linje `1.232.1 · #1360` under «August 2026» (teller bumpet 39→40 rettinger).
`npm run typecheck` kjørt selv under Node 22 → **0 feil**.

### 5. Staging-klikkrunde av berørt flyt — PASS (med forbehold, se funn 1)

Kan ikke gjentas (server stoppet, testdata ryddet); vurdert på dokumentert evidens.
Evidensen er spesifikk og internt konsistent: DB-verifiserte tilstandsendringer
(`approved_at` satt via service-role SELECT, `games.status = 'finished'`), full flyt
inkl. at lenken forsvinner etter override, og eksplisitt prod-vakt (alle kall mot
staging-ref `snwmueecmfqqdurxedxv`, 0 fremmede origins). Skjermbevisene på disk
(spill «E2E 1360 godkjenn-lenke», staging-formede testbrukere «Test Admin»/«Test
Spiller», v1.232.1-footer) bekrefter at runden faktisk ble kjørt mot branch-builden.

## Diff-hygiene

`git diff origin/main...HEAD --stat`: nøyaktig 6 filer (CHANGELOG, avslutt/page.tsx,
no.json, en.json, package.json, package-lock.json) — alle forventet, ingen utilsiktede
endringer. PR-body har Fordeler/ulemper-blokken (fast form for fix-PR-er).

## Funn

1. **Staging-evidensen er ikke postet på PR #1568** (kontraktfilen kriterium 1/5 vs.
   faktisk PR-tilstand). Kontrakten hevder skjermbildene er postet; PR-en har kun
   Vercel-bot-kommentaren, ingen bevis-kommentar og ingen `staging-verified`-label.
   Skjermbildene finnes i øktas scratchpad
   (`…/cec67f5b-…/scratchpad/1360-avslutt-mobile.png` + `1360-spillere-mobile-scrolled.png`)
   og er verifisert ekte — dette er en bokførings-/sekvenseringsglipp, ikke
   evidensfabrikasjon. PR-en er fortsatt draft (konsistent med draft-først-flyten #1516).
   **MÅ før merge (#1076):** post bevis-kommentar med skjermbildene + sett
   `staging-verified`-labelen, deretter `gh pr ready`.

## Sluttverdikt

**ACCEPT** — alle fem suksesskriterier er oppfylt i kode og evidens; funn 1 er en
bokføringsbetingelse som må lukkes før merge, ikke en mangel i selve arbeidet.
