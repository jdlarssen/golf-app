# Forge-kontrakt: #393 — Profil-revamp (kort ned mobil-scroll, tydeligere «Logg ut», fjern «Avbryt»)

**Issue:** https://github.com/jdlarssen/golf-app/issues/393
**Branch:** `claude/zealous-hodgkin-8a9e71`
**Milestone:** Tier 2 — Navigasjon
**Etterslep fra:** #355 (bunn-nav gjorde Profil til fast destinasjon)

## Problem

`/profile` er en lang vertikal stabel av full-høyde-kort på telefon:
profilskjema → Invitér en venn (skjema) → Historikk (2 kort) → Installer app →
GDPR (Eksport + Slett konto) → muted «Logg ut»-lenke → personvern. Hoved-oppgaven
(rediger profil) ligger riktignok øverst, men halen av store kort tvinger mye scroll.
To #355-etterslep: «Logg ut» ble en nesten usynlig muted tekst-lenke, og «Avbryt» i
profilskjemaet er overflødig nå som Profil er en fast nav-fane (ingenting å avbryte).

## Beslutninger (fra gray-area-diskusjon med bruker)

1. **Komprimering = kompakte lenke-rader (settings-liste-stil).** De sjelden-brukte
   navigasjons-seksjonene (Min historikk, Klubbstatistikker, Installer app,
   Eksporter data, Slett konto) blir slanke tappbare rader samlet i ett kort/én
   gruppe, hver med label + chevron. Alt synlig — ingenting gjemt bak accordion-tap.
2. **«Invitér en venn» beholdes som et synlig kort** (ikke kollapset). Bruker:
   *«Jeg ønsker at det lett skal gå an å invitere venner. Det oppfordres.»* Kortet
   skal bruke plassen bedre (tettere intern rytme, kuttet redundant copy) men forblir
   et åpent, innbydende kort plassert rett under profilskjemaet.
3. **«Logg ut» = `Button variant="secondary"`** (outline/transparent med border) —
   gjenkjennelig som knapp, synlig, men ikke en stor primær CTA. Auto-bredde (ikke
   full-bredde — full-bredde leser som primær CTA). Bor nederst med en tynn
   separator over, som i dag.
4. **«Avbryt» fjernes helt** fra profilskjemaet; «Lagre» (`SaveButton`) står alene.
   Skjult `next`-input beholdes (post-save redirect bruker den fortsatt).

## Endelig sideoppsett (topp → bunn)

1. TopBar + banners + `GenderSoftPrompt` (uendret)
2. Profilskjema-kort (Avbryt fjernet, kun Lagre)
3. «Invitér en venn»-kort (beholdt, tettere)
4. Kompakt settings-liste (én gruppe, én understated micro-label): Min historikk ›,
   Klubbstatistikker ›, Installer app ›, Eksporter data ›, Slett konto › (danger-tone)
5. «Logg ut» — secondary/outline-knapp, separator over
6. Personvern-lenke (uendret)

## Berørte / nye filer

- **NY** `components/ui/SettingRow.tsx` — delt list-rad-primitiv. Rendrer som
  `<a>`/SmartLink (href) eller `<button>` (onClick), label + valgfri sublabel +
  chevron, `tone: 'default' | 'danger'`, støtter `download`. Min-høyde 44px.
- **NY** `components/ui/SettingRow.test.tsx` — én fokusert render-test (link m/href +
  label; button-variant; danger-tone-klasse). Type C: maks én test-fil for komponenten.
- `app/profile/page.tsx` — bytt Historikk/Install/GDPR-kortene mot `SettingRow`-liste;
  flytt Invitér-kort opp; restyle `AccountActions` («Logg ut» → secondary Button).
- `app/profile/ProfileFormBody.tsx` — fjern «Avbryt»-`SmartLink` (linje ~213–221) +
  fjern nå-ubrukt `SmartLink`-import (linje 7).
- `app/profile/InviteFriendForm.tsx` — tetting av intern rytme/copy (bruk plassen bedre).
- `components/pwa/InstallButton.tsx` — rendre som `SettingRow` (button-variant) i stedet
  for eget Card; behold self-hide (returnerer null ved `standalone`/`loading`) + modal.
- `package.json` + `CHANGELOG.md` — PATCH-bump + oppføring (bruker-synlig endring).

## Success-kriterier

- [ ] **K1 — Mindre scroll.** De fem sekundære navigasjons-seksjonene (Min historikk,
  Klubbstatistikker, Installer app, Eksporter data, Slett konto) rendres som kompakte
  `SettingRow`-rader i én samlet liste — ikke fem separate full-høyde-`Card`-blokker.
  *Evidens: page.tsx bruker SettingRow ×≥4 + InstallButton-rad; preview-screenshot viser kort liste.*
- [ ] **K2 — «Logg ut» er en gjenkjennelig knapp**, ikke en muted tekst-lenke: bruker
  `Button variant="secondary"` (outline/border), auto-bredde, ikke primær fyll.
  *Evidens: page.tsx AccountActions bruker Button variant="secondary"; preview viser outline-knapp.*
- [ ] **K3 — Ingen «Avbryt»** i profilskjemaet; kun «Lagre» gjenstår. SmartLink-import
  fjernet fra ProfileFormBody. *Evidens: `grep -c Avbryt app/profile/ProfileFormBody.tsx` = 0.*
- [ ] **K4 — «Invitér en venn» beholdt som synlig kort**, plassert rett under
  profilskjemaet, med tettere oppsett enn før. *Evidens: page.tsx rendrer InviteAFriendCard som Card; preview viser åpent skjema.*
- [ ] **K5 — Ingen funksjonalitet tapt.** Alle mål fortsatt nåbare: invitér venn
  (skjema), Min historikk (`/profile/historikk`), Klubbstatistikker (`/profile/statistikk`),
  Installer app (modal/native), Eksporter data (`/profile/export` download), Slett konto
  (`/profile/slett-konto`), Logg ut (`/logout` POST), personvern. *Evidens: href/action per rad verifisert i page.tsx.*
- [ ] **K6 — Slett konto fortsatt via dedikert side.** Raden er ren navigasjon til
  `/profile/slett-konto` (ingen inline-confirm/`<details>`). *Evidens: SettingRow href, ingen inline toggle.*
- [ ] **K7 — Kvalitetsgater grønne** (se under).

## Gates (kjør, scoped til det som endres)

```bash
# 1. Co-lokerte tester for endrede filer (per CLAUDE.md test-disiplin)
npx vitest run app/profile components/ui/SettingRow

# 2. Typecheck + full prod-build (fanger exhaustive-switch / unused-import / RSC-feil)
npm run build

# 3. Lint på endrede filer
npx eslint app/profile components/ui/SettingRow.tsx components/pwa/InstallButton.tsx
```

UI-kriterier (K1, K2, K4) verifiseres i preview (dev-server + screenshot mobil-bredde
390px, lys + mørk) før evaluator-pass.

## Eksplisitt utenfor scope

- Ingen ny `/invite`-side (bruker valgte å beholde invite-kortet, ikke flytte det).
- Ingen endring i profilskjemaets felt, validering eller `updateProfile`-action.
- Ingen endring i slett-konto-/eksport-/historikk-sidene selv — kun inngangs-radene.
- Ingen accordion/collapse på de sekundære radene (bruker valgte flat liste).
- Ingen endring i bunn-nav (#355) eller `GenderSoftPrompt`.

## Versjonering

Bruker-synlig polish (layout + fjernet kontroll + restylet knapp) → **PATCH-bump**
(`npm version patch --no-git-tag-version`, 1.68.1 → 1.68.2) + CHANGELOG-oppføring i
samme commit som den bruker-synlige endringen. Scaffolding-commit (ny ubrukt
`SettingRow` + test) er `refactor(ui)` uten bump. Bruker hook-håndhevet prefiks
(`feat`/`fix`) på den bruker-synlige commiten så versjons-disiplinen holdes.
