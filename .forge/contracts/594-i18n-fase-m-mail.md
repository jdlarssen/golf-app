# Spec: i18n Fase M — transaksjonsmailer locale-aware + språknøytral kode-mail (#594)

> **Del av epic #60.** Master-specen (`60-engelsk-ui-i18n.md`) definerer arkitekturen;
> denne er Fase M sin gjennomførbare kontrakt. Fase D (#592) landet DB/format-innhold.
> Etter M gjenstår kun Fase G (gd/ga).

## Problem

Alle ~11 transaksjonsmailer i `lib/mail/*.ts` er rene funksjoner med **hardkodet
norsk** tekst inline i HTML/`text`. Ingen `send*`-funksjon tar `locale`. En mottaker
med `users.locale = 'en'` får i dag norsk mail — det bryter i18n-løftet fra epic #60
nå som hele in-app-UI-en er engelsk.

`users.locale`-kolonnen finnes (migrasjon `0093`, nullable). `resolveLocale()`
(`lib/i18n/resolveLocale.ts:52`) og per-locale message-loading (`i18n/request.ts`)
finnes fra Fase 0. Katalogene `messages/no.json` + `messages/en.json` har alle
UI-namespacene, men **ingen `mail`-namespace** — mail-strenger bor i koden.
`inviteNotification.ts` leser allerede `formatGuide.content` fra `no.json` (Fase D),
men resten av mailen er hardkodet norsk.

I tillegg sender **Supabase Auth** selve kode-/OTP-mailen fra en Dashboard-mal som
**ikke kan velge mal per mottaker-locale**. Stable to språk oppå hverandre skalerer
ikke til flere språk (eier-beslutning 2026-06-14). Den må redesignes til en
**tekst-minimal, nær språknøytral** form.

## Research Findings

- **`createTranslator({ locale, messages })`** (next-intl) er riktig verktøy for mail:
  mottakerens locale er **ikke** request-locale, så request-scoped `getTranslations`/
  `useTranslations` virker ikke. `createTranslator` tar eksplisitt innlastede messages
  og gir ICU-formattering (plural/interpolasjon) identisk med resten av appen.
  Kilde: [next-intl createTranslator](https://next-intl.dev/docs/usage/messages#standalone).
- **`en.json` har `formatGuide.content`** med engelske `summary`-felt (23 nøkler, Fase D)
  — invite-mailens modus-hint kan dermed bli locale-aware uten nytt innhold.
- **Recipient-resolver** `buildGameFinishedRecipients` (`lib/mail/gameFinishedRecipients.ts:51`)
  bygger `FinishedMailRecipient { userId, email, name }` fra `users(...)`-joins — locale
  legges til som ett ekstra felt i select + interface, og bæres per mottaker.
- **Call-site-locale-kunnskap** (fra kodekartlegging):
  - **Kjent per mottaker** (har `users`-rad i join): gameFinished, productUpdateDigest,
    cupStarted, cupFinished, deliverReminder, registrationApproved/Rejected (mottaker =
    den som registrerte seg → har rad), scorecardSubmitted (mottaker = admin → har rad),
    registrationRequest (mottaker = admin → har rad).
  - **Ukjent** (konto-løs e-post): `sendInviteNotification` (invitee har ingen rad/locale
    enda), `teamInvitation` (lagmedlem invitert på e-post). → default `'no'`.

## Prior Decisions (carried forward)

- **Master-spec Fase M:** locale-param de 12 Resend-malene + per-locale snapshot-tester;
  lever EN Auth-mal til eier; løs auth-mail-locale-skranken.
- **CLAUDE.md test-disiplin (Type B):** snapshot `subject`+`text`+én body-region per case,
  ÉN chrome-lås per mal, delte strukturelle kontrakter i ÉN fil. Per-locale = ny
  locale-dimensjon (ikke copy-endring), så engelske snapshots er legitime nye tester.
- **CLAUDE.md humanizer/no-nb:** retning NO→EN, så `no-nb` gjelder IKKE. Eventuelle nye
  *norske* strenger kjøres gjennom `humanizer`. Engelsk copy får idiomatisk-engelsk-pass.
- **CLAUDE.md versjon/CHANGELOG:** bruker-synlig (EN-mail til EN-mottakere) → MINOR bump
  + CHANGELOG-oppføring. Auth-mal-redesign er også bruker-synlig.
- **lib/mail/AGENTS.md:** ny mail-disiplin — source først, tom-snapshot, `vitest -u`,
  re-run; ÉN chrome-lås per fil; ingen kopier-lim mock-setup.

## Design

### Arkitektur (låst)

1. **Mail-katalog-leser (`lib/mail/i18n.ts`, ny).** Statisk import av `no.json` + `en.json`;
   eksporterer `getMailTranslator(locale: AppLocale)` som returnerer en
   `createTranslator`-instans scoped til `mail`-namespacet (+ tilgang til `formatGuide`
   for invite-hintet). Locale normaliseres via `toSupportedLocale(locale) ?? 'no'`, så
   ukjent/`null` faller til norsk. `gd`/`ga` er ikke i scope her, men faller trygt til
   `'no'` til Fase G fyller dem.
2. **Katalog-struktur.** Nytt `mail`-namespace, sub-namespace per mal:
   `mail.common.*` (delt: brand-subtittel/tagline, «Åpne Tørny»-knapp, footer),
   `mail.invite.*`, `mail.gameFinished.*`, `mail.scorecardSubmitted.*`,
   `mail.deliverReminder.*`, `mail.cupStarted.*`, `mail.cupFinished.*`,
   `mail.registrationRequest.*`, `mail.registrationApproved.*`,
   `mail.registrationRejected.*`, `mail.teamInvitation.*`, `mail.productUpdate.*`.
   ICU for interpolasjon/plural. **HTML-struktur (tabell-layout, styling) blir i koden** —
   kun bruker-synlig tekst flyttes til katalogen, lik resten av appen.
3. **Source-moduler.** Hver `send*`-funksjon får `locale?: AppLocale` (default `'no'`),
   henter `t = getMailTranslator(locale)`, bytter hardkodede strenger med `t('key', {...})`.
   `<html lang="...">` i hver mal blir locale-derivert. `escapeHtml` beholdes på
   interpolerte verdier.
4. **Call-site locale-resolusjon.**
   - `FinishedMailRecipient` får `locale: string | null`; `buildGameFinishedRecipients`
     legger `locale` i `users(...)`-selectene; avslutt-actionen sender per mottaker med
     `recipient.locale ?? 'no'`.
   - `productUpdateDigest`-digesten leser allerede `users(id,name,email)` → legg til
     `locale`, send per mottaker.
   - cup/deliverReminder/registration*/scorecardSubmitted: resolver mottakerens
     `users.locale` der raden allerede hentes; ellers ett ekstra slankt oppslag.
   - `sendInviteNotification` + `teamInvitation`: konto-løse → `'no'`. (Språkvelgeren er
     tilgjengelig etter innlogging; invitee har ingen locale-preferanse å hedre enda.)
5. **Tester (per-locale).** Behold eksisterende norske snapshots. Legg til **engelsk
   default-case** (subject + text + body-region) per mal. Chrome er locale-identisk → ingen
   ny chrome-lås for EN. Strukturelle kontrakter (from/to/error) forblir der de er.
6. **Supabase Auth kode-mail (eier-paste).** Redesign til **tekst-minimal, nær
   språknøytral**: koden som helt, brand-lockup, og maks én kort universell linje
   (eller ingen prosa — brukeren ba om koden fra en allerede-lokalisert `/login`-skjerm og
   vet hva den skal brukes til). Leveres oppdatert i `docs/email-templates.md` med eksakt
   copy-lim + Dashboard-sti. Dette skalerer til N språk fordi den knapt har ord.

### Build-rekkefølge (chunks, commit per chunk)

- **Chunk 1 — Infra + pilot.** `lib/mail/i18n.ts` + `mail.common.*` + `mail.invite.*` i
  begge kataloger; migrer `inviteNotification.ts` til locale-aware (pilot, allerede
  halvveis via formatGuide). EN default-snapshots for invite. `refactor`/`feat` etter
  bruker-synlighet — pilot er bruker-synlig (EN invite til EN-mottaker) → `feat` + bump.
- **Chunk 2–N — Resten av malene**, batchet i logiske grupper (cup-paret, registration-
  trioen, fan-out-tunge gameFinished + productUpdate, enkle scorecardSubmitted +
  deliverReminder + teamInvitation). Katalog-nøkler + source + EN-snapshot per mal.
- **Chunk: Call-sites.** `FinishedMailRecipient.locale` + selects + per-mottaker-send;
  digest-locale; cup/registration/reminder-locale-oppslag.
- **Chunk: Auth-mail-doc.** `docs/email-templates.md` språknøytral redesign.
- **Sluttbump:** MINOR + CHANGELOG (én Fase M-oppføring).

## Edge Cases & Guardrails

- **Ukjent/`null` locale** → `toSupportedLocale() ?? 'no'`, aldri rå nøkkel/tom mail.
- **Manglende katalog-nøkkel** → next-intl `getMessageFallback` (allerede konfigurert i
  `i18n/request.ts`-familien) faller til default-locale-streng; mail må aldri vise `mail.x.y`.
- **Fan-out blandet locale** (gameFinished med både `no`- og `en`-spillere): hver mottaker
  får sin egen `locale` — ikke én locale for hele batchen.
- **Interpolerte bruker-verdier** (navn, spill-navn, lag-navn) escapes fortsatt; de er
  brukerdata og **oversettes aldri**.
- **`text`-delen** (plain-text-fallback) må også locale-renderes, ikke bare HTML.
- **`<html lang>`** i hver mal settes til aktiv locale (a11y/klient-hint).
- **Snapshot-eksplosjon på gameFinished** (24 cases): legg EN-snapshot kun på **default-
  case + de modus-spesifikke subject/body-variantene som faktisk har egen copy**, ikke
  blindt ×2 på alle 24. Mål: bevis at EN-rendring funker per distinkt copy-sti, ikke
  duplisere hver fixture.
- **Resend best-effort** beholdes: locale-oppslag på call-site må ikke kunne kaste og
  blokkere brukerflyten (defensivt `?? 'no'`).
- **Auth-mail er IKKE kode i repoet** — den er Dashboard-config; «leveransen» er
  `docs/email-templates.md` + eier-paste. Ingen test dekker den.

## Key Decisions

- **`createTranslator` med statisk-importerte kataloger** (min beslutning) — eneste
  korrekte verktøy for ikke-request-locale; matcher app-ICU.
- **Kun tekst i katalog, HTML i kode** (min beslutning) — speiler app-konvensjonen;
  unngår å gjøre katalogen til en HTML-blob.
- **Konto-løse invitasjoner → `'no'`** (min beslutning) — invitee har ingen locale-
  preferanse før konto finnes; språkvelger tilgjengelig etter innlogging.
- **Per-mottaker locale i fan-out** (min beslutning) — riktig korrekthet; en `en`-spiller
  i et `no`-spill får engelsk.
- **Auth-mail: tekst-minimal språknøytral redesign, ikke språk-stabling** (eier
  2026-06-14) — skalerer til N språk; koden er innholdet.
- **#583 holdes ute** (eier) — annet lag (varsel-payload-komposisjon), eget issue/PR.

**Claude's Discretion:**
- Eksakt nøkkel-navngiving under `mail.*`.
- Batch-gruppering av malene i chunks.
- Hvor mange modus-spesifikke EN-snapshots gameFinished trenger (bevis-drevet, ikke ×2).
- Eksakt språknøytral form på auth-mailen (minimal prosa vs ren kode + brand).

## Success Criteria

- [ ] **Locale-param:** alle 11 `send*`-funksjoner tar `locale` (default `'no'`) og rendrer
      bruker-synlig tekst fra `mail.*`-katalogen via `getMailTranslator`. Ingen hardkodet
      norsk bruker-synlig streng igjen i `lib/mail/*.ts` (utenom HTML-struktur/attributter).
- [ ] **EN-rendring:** med `locale: 'en'` rendrer hver mal engelsk `subject` + `text` + body
      (bevist av engelske snapshot-tester); med `locale: 'no'`/default uendret norsk
      (eksisterende norske snapshots fortsatt grønne).
- [ ] **Call-sites:** fan-out-mailer (gameFinished, productUpdateDigest, cup) sender hver
      mottaker på dens egen `users.locale`; konto-løse invitasjoner faller til `'no'`.
      `FinishedMailRecipient` bærer `locale`.
- [ ] **Fallback:** ukjent/`null`/`gd`/`ga`-locale → norsk mal, aldri rå nøkkel eller tom.
- [ ] **Katalog-paritet:** `mail`-namespacet finnes i både `no.json` og `en.json` med
      identisk nøkkel-sett (`catalogParity.test.ts` grønn).
- [ ] **Auth-mail:** `docs/email-templates.md` har den nye språknøytrale kode-mal-copyen
      med Dashboard-sti, klar for eier-paste; rasjonalet (skalerer til N språk) dokumentert.
- [ ] **Ingen regresjon:** `npm run build` + `npx tsc --noEmit` grønn; alle `lib/mail/*.test.ts`
      grønne; `catalogParity.test.ts` grønn.

## Gates (per chunk)

- [ ] `npx tsc --noEmit` passerer.
- [ ] `npx vitest run lib/mail messages/catalogParity.test.ts` passerer (scoped til endret).
- [ ] `npm run build` passerer (sluttgate — exhaustive-switch / `[locale]`-rute-feil).
- [ ] Versjon-bump + CHANGELOG på den bruker-synlige sluttcommiten (commit-msg-hook
      håndhever); rene plumbing-chunks bruker `refactor`/`chore`.

## Files Likely Touched

- `lib/mail/i18n.ts` — ny mail-translator-helper.
- `lib/mail/*.ts` (11 maler) — `locale`-param + katalog-rendring.
- `lib/mail/*.test.ts` — EN default-snapshots per mal.
- `lib/mail/gameFinishedRecipients.ts` (+ `.test.ts`) — `locale` i interface + selects.
- `messages/no.json`, `messages/en.json` — nytt `mail`-namespace.
- Call-sites: `app/[locale]/admin/games/[id]/avslutt/actions.ts`,
  `lib/productUpdates/digest.ts`, `lib/cup/actions.ts`,
  `lib/notifications/deliveryReminder.ts`, `app/[locale]/signup/[shortId]/*Actions.ts`,
  `app/[locale]/admin/games/[id]/signups/actions.ts`,
  `app/[locale]/games/[id]/submit/actions.ts`, invite-actionene.
- `docs/email-templates.md` — språknøytral auth-kode-mal.
- `package.json` + `CHANGELOG.md` — MINOR bump.

## Out of Scope

- **#583** (in-app signup-varsel-payloads i norsk) — eget lag, eget issue/PR.
- **gd/ga** (Fase G) — etter at engelsk er fullt rullet ut.
- **Oversetting av brukerdata** (navn, spill-/lag-/klubb-navn, fri tekst).
- **Per-locale Supabase Auth-malvalg** — Supabase støtter det ikke; løsningen er den
  språknøytrale fellesmalen, ikke per-recipient-branching.
