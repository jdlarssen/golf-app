# Forge-kontrakt — #346: Én konsistent «Opprett»-inngang (fast plassering + etikett)

**Issue:** [#346](https://github.com/jdlarssen/golf-app/issues/346) · Part of [#344](https://github.com/jdlarssen/golf-app/issues/344) («Én vei til rom») · labels: `design`, `area:ui`
**Branch:** `claude/crazy-tesla-a3678f`
**Type:** design / nav-konsolidering · PATCH-bump (samme kapabilitet, gjort konsistent + alltid synlig)

## Problem

«Opprett spill»-inngangen varierer i etikett og plassering:
- `app/page.tsx:219` — hjem tom-tilstand: «Opprett en turnering» → `/admin/games/new` (admin) / `/opprett-spill` (trusted). KUN i tom-tilstand.
- `app/page.tsx:398` — hjem trusted ikke-tom: Section «Opprett spill», kort-tekst «Sett opp ny runde» → `/opprett-spill`.
- `app/admin/games/page.tsx:122` — spill-liste: «+ Nytt» → `/admin/games/new`.
- `app/page.tsx:249` (footer-lenke, tom) vs `:381` (accent-kort, ikke-tom) — to ulik-vektede «Sekretariatet»-lenker.

Tre etiketter for samme handling; en admin med spill mister opprett-CTA-en på hjem (kun trusted beholder sin).

## Kontekst funnet i koden (sannhets-anker)

- **Trusted-creators går IKKE inn i Sekretariat-shellen** (`/opprett-spill`, bevisst delt per #198). Derfor kan IKKE en «admin-shell-header»-dør betjene trusted. **Hjem (`/`) er eneste flate som betjener begge roller** → der hører den faste Opprett-inngangen hjemme.
- Rolle-routing: `canCreateGame = is_admin || isTrustedCreator(email)`. Admin → `/admin/games/new`, trusted → `/opprett-spill`. Begge er i scope i `HomeBody`.
- `TopBar` har en per-side `action`-slot (brukt av spill-lista sin «+ Nytt»). Liten uppercase-pill.
- Hjem har to grener: tom-tilstand (sentrert velkomst + footer-lenker Min profil/Sekretariatet/Logg ut) og ikke-tom (nav av Section-kort: Mine spill, Avsluttede, Spillformer, Profil, Admin/Sekretariatet, (trusted) Opprett spill + logout-knapp).
- Intent-veiviseren lager Kompis/Klubb/Cup/Solo — derav «spill» som paraply-ord (cup velges inne i veiviseren).

## Beslutninger (gray-area avklart)

- **Kanonisk etikett: «Opprett spill»** (bruker var usikker → ba om anbefaling). Verb-først (brand-stemme), matcher admin-flatens dominerende ord («Spill»), allerede trusted-seksjonens etikett (minst churn), selvforklarende for ikke-teknisk bruker. Defineres ÉN gang som delt const → ingen drift.
- **Fast plassering: hjem (`/`), begge tilstander, begge roller.** En prominent primær-knapp (`LinkButton full`, samme behandling som dagens tom-tilstand-CTA) plassert øverst i ikke-tom-grenen, rollet riktig. Eneste plassering som betjener både admin og trusted; mest brukervennlig (dør der man lander).
- **Spill-lista:** «+ Nytt» → kanonisk etikett, rute uendret (`/admin/games/new`).
- **Sekretariatet-konsolidering:** delt `HomeUtilityFooter`-komponent (Min profil · Sekretariatet [admin] · Logg ut) brukt i BEGGE hjem-grener → én representasjon, konsistent vekt. Ikke-tom-grenens accent «Admin»-kort + separate «Profil»-kort + logout-knapp erstattes av samme footer-cluster som tom-tilstand allerede har.

## Akseptkriterier

- [x] **AC1** — Samme etikett «Opprett spill» for opprett-handlingen på alle flater (hjem tom-CTA, hjem ikke-tom primær-knapp, spill-lista action), fra én delt const. *Evidens: `CREATE_GAME_LABEL`-import i begge filer; grep viser ingen gjenværende «Opprett en turnering» / «+ Nytt» / «Sett opp ny runde» som opprett-etikett.*
- [x] **AC2** — Én fast, alltid-synlig Opprett-inngang på hjem i BEGGE tilstander (tom + ikke-tom), for både admin og trusted. *Evidens: ikke-tom-grenen rendrer Opprett-knapp for `canCreateGame`; file:line.*
- [x] **AC3** — Én representasjon av Sekretariatet-lenken fra hjem (delt footer i begge grener, konsistent vekt). *Evidens: `HomeUtilityFooter` brukt i begge return-grener; ingen accent-kort-vs-footer-lenke-divergens.*
- [x] **AC4** — Rolle-routing bevart: admin → `/admin/games/new`, trusted → `/opprett-spill`, i alle Opprett-flater. *Evidens: file:line.*
- [x] **AC5** — Spill-lista action relabelet til «Opprett spill»; rute uendret. *Evidens: `app/admin/games/page.tsx` file:line.*
- [x] **AC6** — Ikke-creators (vanlige spillere) ser INGEN Opprett-knapp; player-hjem uberørt funksjonelt. *Evidens: `canCreateGame`-gate intakt.*
- [x] **AC7** — Norsk copy passerer humanizer (verb-først, ingen særskriving/anglisisme). *Evidens: humanizer-skill.*
- [x] **AC8** — `package.json` PATCH-bump (1.60.2 → 1.60.3) + `CHANGELOG.md`-oppføring; commit-msg-hook grønn. *Evidens: hook passerer.*

## Filer

- `lib/games/createGameLabel.ts` — ny delt const `CREATE_GAME_LABEL = 'Opprett spill'`.
- `app/page.tsx` — relabel tom-CTA; ny prominent Opprett-knapp i ikke-tom; delt `HomeUtilityFooter` i begge grener; fjern redundant trusted-only opprett-seksjon.
- `app/admin/games/page.tsx` — relabel TopBar action.
- `package.json` + `CHANGELOG.md` — bump + oppføring.

## Gates (scoped)

```bash
npm run lint
npx tsc --noEmit          # forvent kun pre-eksisterende test-fil-feil
npx vitest run app        # fang evt. hjem/spill-liste-tester som asserter gammel etikett
npm run build             # autoritativ (RSC-graf)
```

## Ut av scope (ikke gold-plate)

- Ingen endring i selve veiviseren / `/opprett-spill` / `/admin/games/new`-rutene.
- Ingen redesign av spill-kortene, Spillformer-seksjonen, eller tom-tilstand-helten utover relabel + delt footer.
- Invitasjons-dør-konsolidering → #348 (eget issue).
- Ikke rør player-hjem-innhold for ikke-creators utover delt footer.
