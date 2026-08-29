# Spec: Polish-bølgen fra subtraksjonsrevisjonen (#1069-triagen, eier-avgjort 2026-08-29)

Eier-triage 2026-08-29 (fire tap-spørsmål, alle besvart): 11 av triagens 15 verifiserte
restfunn bygges; lag-klyngen og QR-snarveien parkeres med vekketriggere. Hvert valgt
punkt files som eget child-issue (K1–K9 under); denne kontrakten er felles spec og
postes på hvert issue. #1069 lukkes når alt er filet og parkeringene står i
`docs/hva-er-nok.md`.

**Issue-kart (filet 2026-08-29):** K1=#1792 · K2=#1793 · K3=#1794 · K4=#1795 ·
K5=#1796 · K6=#1797 · K7=#1798 · K8=#1799 · K9=#1800.

## Problem

Subtraksjonsrevisjonen 2026-07-05 (6 revisor-agenter + skeptisk verifisering, 36 funn)
etterlot 15 kode-verifiserte restfunn i #1069. Re-verifisert mot main 2026-07-26 og
(delvis) 2026-08-29: fortsatt gyldige. Eieren har nå triagert dem — dette er
polish-bølgen som gjenstår.

## Research Findings (in-repo; ekstern research N/A — ren produktpolish)

- «both»-hullet re-verifisert 2026-07-27 (HCD F5) med linjerefs:
  `registrationTypeView.ts:28–33` (both+lagmodus → team_form),
  `signup/[shortId]/page.tsx:557–579` (kun TeamRegistrationForm rendres, alle slots
  required), `teamActions.ts:247` (avviser submit med færre), MEN
  `signup/[shortId]/actions.ts:190–195` slipper solo-POST gjennom for both.
  Stikkprøve 2026-08-29: kommentaren «`both` tillater solo-grenen» står fortsatt.
- `SubmitForm.tsx`: window.confirm nå på :98 (drift fra :62–78) — fortsatt der.
- Linjenumre i HELE denne kontrakten er omtrentlige (revisjonen er 8 uker gammel) —
  hver bygger MÅ re-verifisere sitt punkt mot HEAD og skrive drift-tabell før endring.

## Prior Decisions (bindende)

- #939: putter-pillens PLASSERING i hull-headeren er eier-design — flyttes ikke (K5
  endrer kun trykkflate). #401: Profil-varianten av månedsbrev-bryteren re-litigeres
  ikke (K8 gjelder KUN Innboks-varianten). #936: /profile/historikk er stats-HUB —
  K9 fullfører den. «Forkastet av verifikatorene»-lista i #1069 re-forsøkes ikke.
- Eier-reverseringer eksplisitt godkjent 2026-08-29: #879/#901 (K7-taket), #865
  (K9-flyttingen), stablede nudges (K6).

## Design — child-issues K1–K9

**K1 — Bli med: fjern «begge»-valget + lukk solo-bakdøren + gjem meldingsfeltet**
(type: bug · area: ui · flate: opprett-wizard + /signup)
- Fjern `both` som valgbart alternativ der arrangøren velger påmeldingstype
  (wizard/edit). DB-enumen STÅR; eksisterende both-spill (0 i prod) behandles som
  team overalt (visningen gjør det alt).
- LUKK bakdøren: `registerForOpenGame`s both-gren som slipper solo-POST forbi
  lag-kravet fjernes/strammes — hullet skal LUKKES, ikke flyttes. Hostile-POST-test
  (Type A på action-nivå) som beviser at solo-POST mot et team/both-spill avvises.
- «Be om å bli med»: meldingsfeltet kollapses bak en «legg til melding»-lenke
  (0 forespørsler har brukt det). Auto-ekspander ved `?src=qr`: byggerens skjønn.
- i18n: fjernede/nye nøkler i BEGGE locales; flyt-sjekk: grep `docs/flows/` +
  `docs/user-flows.md` for both/begge — treff → oppdater diagram + PNG i samme PR.

**K2 — Scorekort-levering: spør bare når noe mangler**
(type: enhancement · area: scorecard)
- `SubmitForm`: dropp confirm når alle spilte hull er ført (komplett kort); behold
  (dagens tekst) når hull mangler. Øk avstanden Rediger/Lever (~12px mer
  feiltrykk-margin, fortsatt ≥44px targets).

**K3 — Opprett-flyten: auto-videre fra steg 1 + ærlig spillermangel-banner**
(type: enhancement · area: ui)
- Steg 1: valg av arrangements-flis går automatisk videre (flisen er stegets eneste
  innhold). Semantikk radio → knapper (WCAG 3.2.2 — et radiovalg skal ikke bytte
  kontekst); «Neste» beholdes for deep-links med forhåndsvalgt intent;
  `router.replace` gir ingen per-steg-history — angring via «Forrige» (som i dag).
- Spillermangel-banneret på /opprett-spill: vis kun ved `<= 1` tilgjengelig spiller
  (lista inkluderer alltid en selv — `=== 0` er uoppnåelig og skal IKKE brukes).
  Steg 4 har allerede `PickerSourceEmptyHint` — ingen dobbeltmelding.

**K4 — Admin-detaljsiden: to kort blir ett, Steng påmelding flytter inn**
(type: enhancement · area: admin)
- Slå Format- + Banen-kortet sammen til ett kompakt kort; dropp rating-radene.
  MÅ beholde radene Handicap-justering (%) og Peer-godkjenning — eneste admin-flate
  som viser dem etter start (/edit er blokkert på active).
- «Steng påmelding»-kortet inn som sekundær rad i Påmelding-kortet; gate knappen på
  scheduled + open/manual_approval INNE i kortet; behold én-linjes forklaring.

**K5 — Putter-pillen: trykkflate ≥44px**
(type: design · area: scorecard)
- Hit-area opp til stilguidens 44px-minimum (padding/pseudo-element) UTEN å endre
  visuell plassering/størrelse nevneverdig (#939-designet består).

**K6 — Hjem: én nudge om gangen**
(type: enhancement · area: ui)
- Prioritetskø Install > Push > ProductUpdate > Passkey; maks én synlig om gangen.
  Suksess-/kvitteringsbannere er UNNTATT køen. Blandet server/klient-kvalifisering →
  flicker må håndteres (ikke vis nudge nr. 2 et blunk før nr. 1 kvalifiserer);
  akseptkriterium: ingen synlig banner-bytting ved sidelast i staging-klikk.

**K7 — Hjem: totaltak på funn-kortene**
(type: enhancement · area: ui)
- «Spill du kan bli med i»: ett samlet tak (~3 kort på tvers av listene) i stedet
  for 3 per liste (opptil 9 i dag). Kuratering: klubb > venner > åpne — IKKE
  nærmeste tee-off. (Reverserer #879/PR #901 — eier-godkjent.)

**K8 — Innboks: månedsbrev-bryteren nederst**
(type: enhancement · area: ui)
- KUN Innboks-varianten flyttes nederst. Profil-varianten røres ikke (#401).

**K9 — Profil: «Mine tall» inn i Historikk**
(type: enhancement · area: ui)
- Kortet flyttes (ikke kopieres) fra Profil til /profile/historikk (stats-huben,
  #936). AchievementWall der viser i dag samme bragder = duplikatet fjernes ved
  flyttingen. Profil-siden mister kortet; lenken til Historikk må stå tydelig.
  (Reverserer #865-plasseringen — eier-godkjent som IA-valg.)

## Edge Cases & Guardrails (tverrgående)

- Hvert K re-verifiseres mot HEAD før bygging (drift-tabell i PR/rapport).
- Alle K er bruker-synlige → `feat`/`fix`-commits med `.changes/`-notat per issue
  (K5 kan være `design`-refactor-nivå — byggerens vurdering; i tvil: notat).
  Staging-bevis per §T7 FØR merge: e2e-@gate + målrettet klikk på berørt flate;
  `staging-verified`-label.
- Ingen DB-endringer i noen K (both-enumen står). Ingen endring i mail-templates.
- e2e: sjekk om signup-/wizard-specs asserter på both-valget eller steg-1-Neste —
  oppdater spec-ene i samme PR (data-testid, aldri norsk copy).
- Destruktiv-regelen urørt; ingen nye flater uten pull.

## Key Decisions (eier, 2026-08-29)

- Lag-klyngen (3 punkter) UTSATT til lagformat faktisk brukes i prod → parkeres i
  `docs/hva-er-nok.md` med vekketrigger «første reelle lag-påmelding».
- QR-snarveien (hopp over re-bekreftelse etter OTP) UTSATT — rører auth-flyten;
  parkeres med vekketrigger «eier-pull / turnering med plakat-QR planlagt».
- Alle fire eier-reverseringer (K6, K7, K8, K9) eksplisitt godkjent.
- Spillermangel-banneret: `<= 1`-varianten valgt (ikke fjerning).

**Claude's Discretion:** komponent-snitt, nudge-kø-mekanikk (server-flagg vs
klient-orkestrering, så lenge flicker-kravet holdes), auto-ekspander ved ?src=qr,
eksakt spacing i K2, batching av K-ene i PR-er.

## Success Criteria

- [ ] P1: Ni child-issues K1–K9 filet med type-/area-label + milestone, hver med
      denne kontrakten som «Forge-kontrakt tilgjengelig»-kommentar.
- [ ] P2: Parkeringene (lag-klyngen + QR) står i `docs/hva-er-nok.md` med
      vekketriggere; #1069 lukket med triage-resultat-kommentar (Teknisk/Funksjonell)
      som mapper alle 15 punkter → issue/parkert/forkastet.
- [ ] P3 (per K ved bygging): kriteriene i K-seksjonen over + drift-tabell +
      staging-bevis + grønn CI; én PR per K eller små K-batcher (byggerens valg,
      aldri på tvers av en eier-reversering og en ikke-reversering i samme commit).
- [ ] P4: K1s hostile-POST-test rød mot gammel kode, grønn etter (TDD-bevis).

## Gates

Per chunk: `npx tsc --noEmit` + `npx vitest run <berørt>` + `npx eslint <berørt>`.
Per PR: `npm run build` + full `npx vitest run` + CI (verify/e2e/scan) + staging-
klikk av berørt flyt.

## Files Likely Touched (re-verifiseres — 8 uker gamle referanser)

- K1: wizard-steget for påmeldingstype, `lib/games/registrationTypeView.ts`,
  `app/[locale]/signup/[shortId]/actions.ts` (+page), i18n-filer, docs/flows
- K2: `app/[locale]/games/[id]/submit/SubmitForm.tsx`
- K3: opprett-wizardens steg 1 + spillermangel-banner-komponenten
- K4: admin games-detaljside-kortene
- K5: putter-pillen i hull-headeren (`PuttsTogglePill.tsx` etter #1716)
- K6/K7: Hjem-komponentene (nudges + funn-lister)
- K8: Innboks-siden · K9: Profil + /profile/historikk

## Out of Scope

- Lag-påmeldings-klyngen (parkert, vekketrigger: første reelle lag-påmelding).
- QR-snarveien forbi re-bekreftelsen (parkert, vekketrigger: eier-pull/plakat-QR).
- Hele «Forkastet av verifikatorene»-lista i #1069 — re-forsøkes ALDRI uten ny grunn.
- both-enumen i DB (står), rename av lagnavn (fulgte lag-klyngen).
