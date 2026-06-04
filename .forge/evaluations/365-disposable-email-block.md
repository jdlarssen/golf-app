# Evaluering: #365 — Disposable-email-blokk før åpen selvregistrering

**VERDICT: ACCEPT**

Evaluert uavhengig 2026-06-04 mot `.forge/contracts/365-disposable-email-block.md`. All evidens re-verifisert ved å lese koden og kjøre gates selv — builderens evidens-linjer er ikke tatt på tro.

---

## Gate-resultater (kjørt av evaluator)

| Gate | Kommando | Resultat |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **EXIT=0** |
| Tester (3 filer) | `npx vitest run lib/auth/disposableEmail.test.ts "app/(auth)/login/actions.test.ts" lib/auth/loginRateLimit.test.ts` | **3 filer, 54 tester passed** |
| Lint (6 berørte filer) | `npx eslint <6 filer>` | **EXIT=0** |
| Rate-limit uendret | `git diff origin/main...HEAD -- lib/auth/loginRateLimit.ts` | **tom diff** (ipMax = 10 uendret) |
| Migrasjoner | `git diff --stat -- supabase/migrations/*` | **ingen** |
| npm-dep | `git diff -- package-lock.json` | **kun version-felt 1.72.0→1.73.0** |

---

## Per-kriterium (uavhengig verifisert)

| K | Beskrivelse | Resultat | Evidens (egen verifikasjon) |
|---|---|---|---|
| K1 | Helper-logikk korrekt (true for disposable, false for normale + malformert, case-insensitiv, eksakt match, kaster aldri) | **PASS** | `lib/auth/disposableEmail.ts:15-23` — `lastIndexOf('@')`, slice+trim+lowercase, `.has()`. Eksakt match (ingen suffiks). Test-fil 26 assertions grønne, dekker casing (`Spam@MailInator.COM`→true), `notmailinator.com`→false, `mailinator.com.evil.no`→false, 5 malformerte→false. Total: `''`, `no-at-sign`, `trailing@`, `@leading.com`, `a@@b.com` returnerer alle false uten kast (verifisert ved kodelesing: ingen `@`→-1→false; tomt domene→false). |
| K2 | Block når self-reg PÅ → redirect `disposable_email`, ingen RPC/OTP | **PASS** | `actions.ts:70-73` gated på `allowSelfReg && isDisposableEmailDomain(email)`, redirecter før RPC (linje 77) og signInWithOtp (82). Test «blocks a known disposable domain when self-reg is on» asserter redirect + `rpcMock`/`signInWithOtpMock` not.toHaveBeenCalled. |
| K3 | Block uavhengig av invitasjon | **PASS** | Sjekken ligger FØR `email_is_invited`-RPC, så invitasjons-status leses aldri. Test «blocks disposable domains regardless of invitation status» setter `rpcMock={data:true}` (would-be invited), forventer likevel redirect + ingen OTP. Beslutning B implementert korrekt. |
| K4 | Ingen regresjon når self-reg AV | **PASS** | `allowSelfReg`-gate (`actions.ts:58-59,70`). Med flagget false hoppes hele if-blokken. Test «does not block disposable domains when self-reg is off» bekrefter redirect ≠ disposable_email + OTP kalt 1×. |
| K5 | Normal e-post uberørt | **PASS** | Normal e-post passerer `.has()`→false. Eksisterende «passes shouldCreateUser=true… when the flag is on» grønn; alle 54 tester på tvers grønne. |
| K6 | Norsk melding vist | **PASS** | `page.tsx:21-22` `disposable_email: 'Engangs-e-post går ikke. Bruk en vanlig e-postadresse, så er du i gang.'`. Kjørt gjennom humanizer-skillet av evaluator: ingen AI-tells, ingen anglisisme, korrekt særskriving, bar imperativ (ingen «vennligst»), konsistent tone med sibling-meldinger. Rendres via eksisterende `Banner`-mekanisme (`page.tsx:44`). |
| K7 | IP-tak uendret + dokumentert | **PASS** | `git diff` på `loginRateLimit.ts` tom; `ipMax = 10`/`emailMax = 3` defaults intakt (linje 45-46). Beslutning A dokumentert i kontrakt §2 + CHANGELOG `#### Decided`. |
| K8 | Gates grønne | **PASS** | Se gate-tabell over: tsc EXIT=0, 54 passed, eslint EXIT=0, version 1.73.0, CHANGELOG-serie lagt til + 1.72.y kollapset. |

---

## Adversarielle funn

### 1. Rekkefølge / bypass — VERIFISERT KORREKT
Faktiske linjenumre i `app/(auth)/login/actions.ts`: honeypot (29-35) → tom-e-post-guard (37) → rate-limit (47-51) → disposable-sjekk (70-73) → `email_is_invited`-RPC (77) → `signInWithOtp` (82). Nøyaktig som kontrakten hevder. Honeypot kortcircuiterer fortsatt først (egen test bekrefter ingen rate-limit-call når honeypot fyres). Disposable-spray brenner fortsatt IP-bøtta fordi rate-limit kjører før disposable-sjekken. Gating på `allowSelfReg` betyr invite-only-modus (dagens prod) er uendret.

### 2. Lukker spray-invite-hullet? — JA, og scopingen er forsvarlig
Beslutning B (block uansett invitasjon) er korrekt implementert: sjekken ligger før RPC-en, så «invitert = unntatt»-regelen finnes ikke. Jeg jaktet på andre konto-opprettings-veier:
- **Eneste `signInWithOtp`-kallested** er `login/actions.ts` (verifisert med grep over hele `app`+`lib`). Ingen andre auth-session-opprettende flate.
- **`app/invite/actions.ts` (venne-invite)** og **`app/signup/[shortId]/teamActions.ts:438` (lag-medspiller-invite)** inserter `invitations`-rader med vilkårlig e-post UTEN disposable-guard. MEN: en `invitations`-rad er bare en pending-post — den oppretter ingen auth-konto. Den disposable-adressen MÅ gå til `/login` og be om OTP-kode for å faktisk lage konto, og DEN veien er nå gated. Adressen dør ved innloggings-steget. Dette er nøyaktig argumentet i kontrakt §5, og det holder: ingen restvektor som faktisk oppretter en konto med disposable-adresse når self-reg er på.
- **Konklusjon:** Scopingen til `/login` etterlater ikke et utnyttbart hull for konto-opprettelse. Akseptabelt. (Ikke-blokkerende observasjon: en disposable venne-invite vil sende en notifikasjons-mail til en disposable-innboks og skape en død `invitations`-rad — kosmetisk støy, ikke et sikkerhetshull. Ikke verdt eget issue.)

### 3. False positives — INGEN
Skannet `disposableDomains.ts` for mainstream-providere (gmail/outlook/hotmail/icloud/yahoo/proton/live/msn/aol/online.no/tornygolf) — ingen treff. Matching er eksakt på lowercased domene (ingen substring/suffiks), så `notmailinator.com` og `mailinator.com.evil.no` slipper gjennom (verifisert i test). Lav false-positive-risiko.

### 4. Totalitet — HELPER KASTER ALDRI
`isDisposableEmailDomain`: `lastIndexOf` på string kaster ikke; `slice`/`trim`/`toLowerCase` kaster ikke; `Set.has` kaster ikke. Tidlig-retur på manglende `@` og tomt domene. Alle 5 malformerte input i testen returnerer false. Verifisert ved kodelesing — ingen kast-vei.

### 5. IP-beslutning honorert — JA
`git diff origin/main...HEAD -- lib/auth/loginRateLimit.ts` er tom. `ipMax = 10` uendret. Beslutning A dokumentert begge steder.

### 6. CHANGELOG / versjon — KORREKT
package.json + package-lock.json begge 1.72.0→1.73.0 (MINOR — ny bruker-synlig oppførsel, riktig type). Net-endring i CHANGELOG: +2 åpne/+2 lukkede `<details>` og +2 åpne/+2 lukkede `<summary>` — selv-balansert. Den aggregerte tag-skjevheten i hele filen (287/279 details) finnes ALLEREDE på origin/main (285/277) og er ikke introdusert her. Ny 1.73.y-blokk og 1.72.y-wrap er velformet. tre-lags struktur (tema-heading + tagline-blockquote + Teknisk-details med Added/Changed/Decided) følger `docs/changelog-conventions.md`.

### 7. Norsk copy-kvalitet — REN
Humanizer-pass kjørt av evaluator på banner-strengen: ingen anglisisme, ingen «vennligst», korrekt særskriving («engangs-e-post», «e-postadresse»), ingen em-dash, bar imperativ, konsistent med sibling ERROR_MESSAGES-tone. Tagline og Teknisk-tekst i CHANGELOG (markdown, skannes ikke av hook) er også naturlig norsk.

---

## Blokkerende problemer
Ingen.
