# Spec: Demo-spilleren bygger identitet før registrering (#1173)

**Issue:** [#1173](https://github.com/jdlarssen/golf-app/issues/1173) · UX-psykologi-runden (IKEA-/eierskaps-effekten) · Flyt 1 (bli bruker), via demo → registrering
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Prøvespill-demoen (#1042) lar folk spille før innlogging, men spilleren heter hardkodet «Deg»
(`lib/demo/seed.ts:46`), ingenting av det brukeren «bygger» bæres inn i registreringen, og
konverterings-CTA-en sier «Kom i gang» (`demo.ctaButton`) — start-fra-null-semantikk. Duolingo-
mønsteret: invester før kontoveggen, og si «Fortsett» — du gir ikke slipp på noe du eier.

## Research Findings (verifisert i denne økten)

- `app/[locale]/demo/DemoGame.tsx` er 100 % klient-side: navnet «Deg» brukes i `ScoreCard`
  (:108-110, name + initial) og i `playersById`-mappen til tavla (:53-59). CTA:
  `LinkButton href="/login?next=%2F"` med `t('ctaButton')` (:159-161). Seed-en (`lib/demo/seed.ts`)
  bærer navn kun for visning — `buildDemoContext` bruker bare userId/handicap → navnet kan
  overstyres i DemoGame-state uten å røre scoring.
- **Prefill-mekanikken finnes allerede:** `complete-profile/page.tsx:57` echo-er `?name=` inn i
  navn-feltets `defaultValue` (:106, #748). Men å tre navnet gjennom login-flyten som query-param
  krever endringer i to-stegs OTP-actions (`(auth)/login/actions.ts` — sensitivt auth-område) og
  hjem-redirecten (`app/[locale]/page.tsx:176-178` redirecter til `/complete-profile` UTEN params).
  → localStorage er den ikke-invasive bæreren.
- Tester i dag: `DemoGame.test.tsx` (én Type C; asserter `getByText('Deg')` + CTA-href) og
  `e2e/demo/demo.spec.ts` (driver på testid/role, aldri copy — CTA-tekstbytte brekker den ikke).
- `demo`-namespacet i `messages/no.json`/`en.json`; `catalogParity.test.ts` krever paritet.

## Prior Decisions

- **#1042:** demoen rører ALDRI `writeScore`/sync/Dexie-`'golf-app'`; klient-lagring bruker
  `torny-<feature>-`-prefiks; CTA går til `/login?next=%2F`; in-memory state (reload = restart).
- **#1138 (ÅPEN, samme fil):** slår sammen banner+intro og fjerner finishedHint i `DemoGame.tsx`
  — koordiner/rebase hvis den lander først; denne kontrakten må ikke avhenge av `demo.intro`/
  `demo.finishedHint`-nøklene.
- **#344 «Én dør per rom»:** fortsatt én demo-inngang og én konverterings-CTA.

## Design (MINIMAL scope — adoptert som Key Decision)

**(a) Visningsnavn ved demo-start.** Lite tekstfelt øverst i demoen (over hull-kortet — ingen
egen start-skjerm; 60-sekunders-flyten skal ikke få et ekstra steg): «Hva heter du?»-aktig label,
placeholder «Deg», `maxLength={40}`. State `youName` i DemoGame; trimmet ikke-tom verdi brukes i
`ScoreCard` (name + initial) og `playersById` — tomt felt faller tilbake til «Deg» overalt.
Seed-fila røres ikke.

**(b) Navnet bæres til registreringen via localStorage.** Nøkkel **`torny-demo-name`**
(torny-konvensjonen). Demoen skriver trimmet navn ved endring (fjerner nøkkelen når feltet
tømmes). `/complete-profile` får en liten klient-øy rundt navn-`Input`-en som på mount — KUN når
feltet ikke allerede har echo-verdi fra valideringsbounce (#748) — leser nøkkelen, prefyller
feltet og sletter nøkkelen (engangs-forslag; brukeren kan fritt endre før innsending).

**(c) CTA-omformulering.** `demo.ctaButton`: «Kom i gang» → «Fortsett»-semantikk (begge kataloger).
`ctaHeading`/`ctaBody` beholdes. Href uendret (`/login?next=%2F`).

## Edge Cases & Guardrails

- **Demo-navnet kan ikke forurense ekte data:** demoen er klient-side uten skriveveier (#1042-
  invarianten står: fortsatt ingen import av `writeScore`/`startSyncListener`/`getBrowserClient`).
  Prefill-en er et redigerbart forslag i et felt server-actionen validerer som før (`actions.ts:34`).
- **Tull-/tomnavn:** trim + maxLength 40 i demoen; whitespace-only → fallback «Deg» og ingen
  localStorage-skriving. Default-navnet «Deg» skrives ALDRI til localStorage (ellers prefylles
  registreringen med «Deg»).
- **localStorage utilgjengelig** (Safari private mode kan kaste): try/catch rundt les/skriv —
  demoen og prefill-en degraderer stille til dagens oppførsel.
- **Valideringsbounce:** echo-param (#748) vinner alltid over localStorage-prefill.
- **Eksisterende tester:** `DemoGame.test.tsx` sitt `getByText('Deg')` overlever (default
  uendret); utvid den ENE testen ved behov — ingen ny Type C-fil for DemoGame. e2e driver på
  testid/role og skal være grønn uendret (evt. navnefelt-steg i golden path er valgfritt).
- **Reset («Spill på nytt»):** nullstiller scores/hull som i dag; om navnet beholdes ved reset er
  byggerens valg (behold anbefales — det er identiteten, ikke rundedata).

## Key Decisions

- **MINIMAL scope:** navn + bæring + CTA-semantikk. Farge/kort-stil/avatar er utsatt idé (Out of Scope).
- **localStorage, ikke query-param:** navnet overlever to-stegs OTP-login uten å røre auth-actions
  (sensitivt område), holder navnet ute av URL-er/logger, og prefill-mekanikken på mottakersiden
  er én liten klient-øy. Samme-enhet-begrensningen er akseptabel (demo og registrering skjer på
  samme telefon). ASSUMPTION dokumentert.
- **Inline navnefelt, ikke start-skjerm:** eierskaps-effekten trenger investering, ikke friksjon.

**Claude's Discretion:** eksakt plassering/styling av navnefeltet (i/under banner-blokka vs. over
hull-kortet), om CTA-en viser navnet («Fortsett som {name}») eller bare «Fortsett», eksakt norsk/
engelsk ordlyd (post-humanizer), debounce/onBlur for localStorage-skriving, om klient-øya i
complete-profile er en wrapper rundt `Input` eller en effekt-komponent, CHANGELOG-tagline.

## Success Criteria

- [x] `/demo` har et navnefelt; å skrive «Jørgen» oppdaterer navnet på ScoreCard OG tavle-raden
      live; tomt felt viser «Deg» begge steder.
      → `DemoGame.tsx:43` `displayName = youName.trim() || youPlayer.name`, brukt i ScoreCard
      (`name`/`initial`, :148-149) og `playersById`-you-raden (:63). Navnefelt `demo-name-input`
      (:120-133). Render-testen (`DemoGame.test.tsx`) asserter «Jørgen» inn → tavla viser
      «Jørgen», «Deg» borte. vitest 10/10 grønn.
- [x] Etter å ha satt navn i demoen: fersk/nullstilt bruker som lander på `/complete-profile`
      (samme nettleser) ser navnet prefylt i navn-feltet, kan endre det, og nøkkelen
      `torny-demo-name` er fjernet etter prefill.
      → `OnboardingNameField.tsx`: ukontrollert `Input` + ref; effekt leser `torny-demo-name`
      ved mount (kun når `initialName` tom — #748-echo vinner), skriver til DOM, sletter nøkkel.
      Kode-verifisert; ende-til-ende bekreftes i staging-klikkrunden (siste kriterium).
- [x] Demo-CTA-knappen leser som «Fortsett»-semantikk (ikke «Kom i gang») på no + en; href
      fortsatt `/login?next=%2F`.
      → `messages/no.json` `demo.ctaButton = "Fortsett"`, `en.json = "Continue"`; CTA-href
      `/login?next=%2F` uendret (`DemoGame.tsx:198`). Render-test asserter href-en.
- [x] Grep-guard fra #1042 holder: demo-koden importerer fortsatt IKKE
      `writeScore`/`startSyncListener`/`getBrowserClient`/`@/lib/sync`/Dexie.
      → `grep -rnE "^import|from '" app/[locale]/demo lib/demo | grep -E "writeScore|…"` → tom.
- [x] `npx vitest run "app/[locale]/demo" "app/[locale]/complete-profile" messages/catalogParity.test.ts`
      grønn — fortsatt maks ÉN render-test per komponent.
      → 3 filer / 10 tester grønn. Utvidet den ENE DemoGame-render-testen, ingen ny Type C-fil.
- [ ] Ny norsk copy humanizer-kjørt; staging-klikkrunde på torny-staging FØR merge: demo →
      sett navn → CTA → login; prefill verifiseres med nullstilt testbruker
      (`profile_completed_at = null` — staging-skriv er sanksjonert). Skjermbilde på PR-en.
      → Copy («Hva heter du?», «Fortsett») passerte pre-commit AI-tell-scan. Staging-klikkrunden
      gjenstår som pre-merge-steg (utføres etter PR åpnes).

## Gates

- [x] `npx tsc --noEmit` grønn · `npm run lint` grønn · `npm run build` grønn
      → tsc exit 0; lint 0 errors (55 pre-eksisterende complexity-warnings, ingen mine);
      build fullførte med full rute-manifest.
- [ ] `npx playwright test e2e/demo/demo.spec.ts` grønn (mot staging-env)
      → kjøres i staging-klikkrunden (krever staging-env); e2e driver på testid/role, uendret av
      copy-byttet.
- [x] MINOR-bump + CHANGELOG Funksjon-rad (commit-msg-hooken håndhever)
      → 1.188.0 → 1.189.0; CHANGELOG «1.189 · Sett navnet ditt før du logger inn».

## Files Likely Touched

- `app/[locale]/demo/DemoGame.tsx` — navnefelt, `youName`-state, localStorage-skriv, CTA-nøkkel
- `app/[locale]/demo/DemoGame.test.tsx` — utvid eksisterende test (ingen ny fil)
- `app/[locale]/complete-profile/page.tsx` + ny liten klient-øy — prefill fra `torny-demo-name`
- `messages/no.json` + `messages/en.json` — navnefelt-nøkler + endret `ctaButton`
- `CHANGELOG.md`, `package.json` — minor + Funksjon-rad

## Out of Scope (utsatt idé — noter i closing-kommentar)

- Farge/kort-stil/avatar-valg i demoen (eierskaps-utvidelse; egen sak hvis pull oppstår).
- Å bære HCP eller demo-resultatet inn i registreringen; konverterings-attribusjon (#1042 OoS).
- Endringer i login-actions/OTP-flyten; banner/intro-rydding (#1138 — egen kontrakt).
