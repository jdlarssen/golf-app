# Spec: Outlook/Hotmail-leveringsdømme — DMARC-innsyn, Microsoft-innmelding og content-hygiene

**Issue:** #319 (milestone Tier 1 — Onboarding & førsteinntrykk) · **Branch:** claude/319-outlook-leveringsdomme

## Problem

Tørny-mail fra `noreply@tornygolf.no` (Resend) havner ofte i søppelpost hos Hotmail/Outlook.com — Gmail rammes ikke. Diagnosen i issuet er verifisert på nytt mot live DNS i dag (2026-07-07): auth er korrekt (`send.tornygolf.no` SPF `include:amazonses.com ~all` ✅, `resend._domainkey` DKIM-nøkkel ✅, return-path MX `feedback-smtp.eu-west-1.amazonses.com` ✅), men `_dmarc.tornygolf.no` er fremdeles `v=DMARC1; p=none;` — **ingen `rua=`, null innsyn**. Årsaken er avsender-omdømme (ungt lavvolums-domene, Microsoft straffer slike hardt), ikke ødelagt konfig.

Dette er en **ops-/leveranse-sak, ikke en kode-sak**: tyngdepunktet ligger i manuelle steg eieren gjør i tredjeparts-UI-er (Domeneshop DNS, Microsoft SNDS/JMRP, Outlook-skjema). Den eneste ekte kode-flaten er allerede levert: `productUpdateDigest.ts:174-178` sender allerede `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058), låst av `productUpdateDigest.test.ts:319-345`. Akseptansekriterium #3 i issuet er m.a.o. allerede oppfylt. Byggerens leveranse her er derfor **én runbook-fil** som gjør eierens manuelle steg kopier-lim-klare (jf. CLAUDE.md samarbeidsmodell), samt en dokumentert content-hygiene-gjennomgang av invite-mailen.

## Design

1. **`docs/email-deliverability.md` (ny runbook) — hovedleveransen.** Samler alt eieren trenger, i samarbeidsmodell-formen (hvor / hva å endre / hva du forventer å se / hva du gjør hvis ikke). Seksjoner:
   - **Diagnose (dagens tilstand):** tabellen fra issuet, oppdatert med dagens dig-verifiserte verdier (SPF/DKIM/return-path ✅, DMARC `p=none` uten `rua`). Sitér at auth passerer — problemet er omdømme, ikke konfig.
   - **DMARC-innsyn på (Domeneshop → DNS):** eksakt ny TXT-verdi for `_dmarc.tornygolf.no`:
     ```
     v=DMARC1; p=none; rua=mailto:dmarc-reports@tornygolf.no; fo=1
     ```
     Forutsetning som eieren gjør: opprett `dmarc-reports@tornygolf.no` hos Domeneshop først (ellers bounce-er rapportene). Behold `p=none` til rapportene er rene; stram gradvis senere (`p=quarantine` → `p=reject`) — det er en egen, senere oppgave (Out of Scope her).
   - **Meld domenet inn hos Microsoft:** steg-for-steg for **SNDS** (Smart Network Data Services) og **JMRP** (Junk Mail Reporting Program) — hvor eieren registrerer seg, hva som kreves (avsender-IP fra Resend/SES; hentes fra Resend-dashboard eller SES), og hva eieren forventer å se.
   - **Outlook Deliverability Support — ferdig utkast:** den norske/engelske henvendelses-teksten eieren limer inn i skjemaet («utkast fra hovedchatten» i issuet). Kort, saklig: ungt legitimt domene, korrekt SPF/DKIM/DMARC, transaksjonell golf-turneringsmail, ber om revurdering av omdømme.
   - **List-Unsubscribe: allerede levert.** Kort notat med referanse til `lib/mail/productUpdateDigest.ts:174-178` + testen `productUpdateDigest.test.ts:319-345`. Ingen kode-endring.
   - **De første mottakerne trener filteret:** be tidlige Hotmail-mottakere merke «ikke søppelpost» + legge `noreply@tornygolf.no` som trygg avsender.
   - **Eier-sjekkliste (manuelt):** punktliste som speiler «Manuelt (Jørgen)»-blokken i issuet, inkl. sjekk av Resend-dashboard (domene fullt verifisert? bounce-/complaint-rate?).

2. **Content-hygiene-gjennomgang av invite-mailen (dokumenteres i runbooken, item #4).** Revider `lib/mail/inviteNotification.ts` mot phishing-tell-sjekklista i issuet: tekst/HTML-balanse (ikke tynn tekst + stor knapp), avsender-kontekst i footer, ingen URL-shortenere, ingen mismatch mellom lenketekst og `href`. Forankring: mailen har i dag intro-linje + get-started-linje + knapp + footer-disclaimer (`invite.footerDisclaimer`, `messages/no.json:4586`), personalisert med inviterens navn, og alle lenker peker til `tornygolf.no/login` (ingen shortener, matchet href). #318 (innloggingskode i invite-mailen) ble satt til side, så den phishing-forsterkningen issuet fryktet lander aldri. Konklusjonen skrives inn i runbooken. **Kun** hvis gjennomgangen finner et konkret tell, gjør en minimal copy-justering (se Claude's Discretion) — ellers ingen kildekode-endring.

3. **Ingen DB-/migrasjon-/RLS-endring** i dette issuet → ingen ny migrasjon, ingen prod-brannmur-luke. DMARC/DNS bor hos Domeneshop, ikke i Postgres.

## Edge Cases & Guardrails

- **Ikke legg `List-Unsubscribe` på transaksjonsmail (invite/kode).** Issuet sier eksplisitt at det ikke trengs; det finnes heller ingen unsub-token-infrastruktur for konto-løse invitéer, og en engangs-invitasjon kan man ikke melde seg av. Å legge headeren på uten en fungerende avmeldings-endpoint er verre enn å la være.
- **Ikke dikt opp en fysisk postadresse i footeren.** Tørny er en solo-drevet app uten organisasjon; en oppdiktet adresse er en ny tell, ikke en kur. «Avsender-kontekst» dekkes av inviterens navn + brand-footer som allerede finnes.
- **Hvis copy-justering gjøres (kun ved konkret tell):** da er endringen bruker-synlig → kjør `humanizer:humanizer` på ny norsk copy, oppdater snapshots med `npx vitest run lib/mail/inviteNotification.test.ts -u` og review hver diff visuelt, bump `npm version patch` + CHANGELOG-linje (Feilrettinger), og staging-verifiser invite-flyten før merge. Endres begge locale-kataloger (`messages/no.json` + `messages/en.json`) i samme commit (catalog-parity-testen håndhever likhet).
- **Docs-only default:** finner gjennomgangen ingen tell (forventet utfall), er PR-en ren docs → ingen version-bump, ingen CHANGELOG, ingen staging-verify.

## Key Decisions

- **Runbook-fil er den byggbare leveransen.** De fleste akseptansekriteriene i issuet (DMARC-record byttet, SNDS/JMRP registrert, Outlook-skjema sendt) er tredjeparts-UI-arbeid eieren gjør — de kan ikke lukkes av byggeren og forblir eier-gatet. Byggeren leverer det som gjør dem utførbare: kopier-lim-klare verdier + steg + Outlook-utkast, samlet ett sted.
- **Akseptansekriterium #3 (List-Unsubscribe) er allerede oppfylt** — verifiseres og dokumenteres, ikke re-implementeres.
- **DMARC-stramming (`p=quarantine`/`reject`) er senere arbeid**, avhengig av at `rua`-rapportene er rene først. Ikke i denne runden.

**Claude's Discretion:** runbookens seksjons-rekkefølge og formatering; nøyaktig ordlyd i Outlook Deliverability-utkastet (saklig, ærlig, ikke over-selgende); om SNDS/JMRP-stegene skrilles ut med skjermbilde-forventninger eller holdes som ren punktliste; hvorvidt content-hygiene-gjennomgangen konkluderer med «ingen endring nødvendig» (forventet) eller en minimal copy-tweak (kun ved konkret tell, med eier-godkjenning på brand-voice per CLAUDE.md).

## Success Criteria

- [ ] `docs/email-deliverability.md` finnes og dekker: dagens dig-verifiserte diagnose, eksakt DMARC-TXT-verdi (`v=DMARC1; p=none; rua=mailto:dmarc-reports@tornygolf.no; fo=1`) med `dmarc-reports@`-forutsetningen, SNDS + JMRP-innmelding, ferdig Outlook Deliverability-utkast, List-Unsubscribe-status (allerede levert, med kode-referanse), «tren filteret»-asken og eier-sjekklista.
- [ ] Runbooken følger samarbeidsmodell-formen (hvor / hva å endre / hva du forventer / hva hvis ikke) for hvert manuelt eier-steg.
- [ ] List-Unsubscribe-statusen er verifisert mot faktisk kode (`productUpdateDigest.ts:174-178` + testen) og korrekt gjengitt — ingen ny header-kode lagt til.
- [ ] Content-hygiene-gjennomgangen av `inviteNotification.ts` er dokumentert i runbooken med en eksplisitt konklusjon (ingen tell funnet → ingen endring, ELLER konkret tell + minimal fiks).
- [ ] (Kun hvis copy endret) `messages/no.json` + `messages/en.json` endret i samme commit; snapshots oppdatert; version-bump + CHANGELOG-linje; staging-verifisert.

## Gates

- [ ] `cd <worktree> && git diff --stat origin/main..HEAD` — docs-only (kun `docs/email-deliverability.md`) med mindre en copy-tweak ble gjort
- [ ] `cd <worktree> && npx vitest run lib/mail/productUpdateDigest.test.ts` grønn (bekrefter List-Unsubscribe-låsen som runbooken siterer)
- [ ] (Kun hvis copy endret) `cd <worktree> && npx vitest run lib/mail/inviteNotification.test.ts` grønn · `npm run build` · `npm run lint` · staging-verify av invite-flyten

## Files Likely Touched

- `docs/email-deliverability.md` — ny runbook (hovedleveransen)
- `lib/mail/inviteNotification.ts` — kun lest for content-hygiene-gjennomgang; endres bare ved konkret phishing-tell (discretionary)
- `messages/no.json` + `messages/en.json` + `lib/mail/inviteNotification.test.ts` — kun hvis en copy-tweak faktisk gjøres (discretionary)

## Out of Scope

- **Alle manuelle eier-steg** (opprette `dmarc-reports@` + bytte DMARC-record hos Domeneshop, registrere SNDS/JMRP, sende Outlook-skjema, sjekke Resend-dashboard) — runbooken beskriver dem; eieren utfører dem i nettleser.
- **DMARC-policy-stramming** (`p=quarantine` → `p=reject`) — senere, etter at `rua`-rapportene er rene.
- **#318 innloggingskode i invite-mailen** — satt til side; ikke reintrodusér.
- **List-Unsubscribe på transaksjonsmail** (invite/kode) — bevisst utelatt (ingen unsub-infra; engangs-mail kan ikke avmeldes).
- **Ny mail-sender-kode eller kode-endring i `productUpdateDigest.ts`** — headeren finnes allerede.
