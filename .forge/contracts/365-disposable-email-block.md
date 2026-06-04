# Kontrakt: #365 — Ekstra usynlig misbruks-vern før åpen selvregistrering

**Issue:** [#365](https://github.com/jdlarssen/golf-app/issues/365)
**Milestone:** Tier 5 — Åpen selvregistrering (avhengighets-låst foran #364)
**Branch:** `claude/youthful-wilbur-c74453`
**Type:** `feat(auth)` — sikkerhetsherding, dormant til #364 skrur på flagget

---

## 1. Bakgrunn og dagens tilstand

Før åpen selvregistrering (#364) skrus på vil vi ha **usynlig** misbruks-vern på plass — uten friksjon for legitime nye brukere. Captcha holdes bevisst utenfor til vi faktisk ser misbruk.

**Hva #166 allerede bygde** (`app/(auth)/login/actions.ts` → `sendCode`):

1. **Honeypot** — skjult `website`-felt; fylt ut → stille suksess-redirect uten DB-call.
2. **Rate-limit** (`lib/auth/loginRateLimit.ts` → `consumeLoginRateLimit`): 3 forsøk per e-post + 10 per IP per 15-min vindu, via `consume_admin_rate_limit`-RPC. Begge bøtter må passere.
3. **Self-reg-flagg** `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION` (default/prod = `false`). Når av: kun inviterte/eksisterende e-poster får `shouldCreateUser=true`. Når på: hvilken som helst e-post oppretter konto ved `verifyOtp`.

Flyt i `sendCode` i dag: honeypot → rate-limit → `email_is_invited`-RPC (beregner `shouldCreateUser`) → `signInWithOtp`.

Feilkoder drives via `?error=<code>` → `ERROR_MESSAGES`-map i `app/(auth)/login/page.tsx` (norsk banner-tekst).

---

## 2. Beslutninger fra gray-area-diskusjon (eier, 2026-06-04)

### Beslutning A — IP-tak: **behold 10** (ikke stram til 6)

Issuet foreslo å vurdere 10 → 6 per IP per 15 min. **Vurdert og avvist.**

**Begrunnelse:** `sendCode`-rate-limit throttler bare *kode-forespørsler*. En forespørsel gjør ingenting alene — angriper må lese koden fra mål-innboksen for å komme videre. For masse-kontoopprettelse bruker angripere innbokser de selv kontrollerer, og **disposable-tjenester (offentlige, lesbare innbokser) er nettopp den billige måten å gjøre det på i skala.** Disposable-blokken (Beslutning B) lukker derfor den faktiske masse-vektoren; IP-taket er bare sekundær volumkontroll. En seriøs angriper roterer IP via proxy, så 6 vs 10 endrer rekkevidden marginalt — mens 6 gir reell friksjon på delt klubb-WiFi (mange spillere som selvregistrerer fra samme nett under en turnering, jf. klubb-skala-målet). 10 koster nesten ingenting i spray-motstand og sparer WiFi-hodebry. **Ingen kodeendring på rate-limit-verdien.**

### Beslutning B — Disposable-blokk: **blokker uansett invitasjon** (når self-reg er på)

Eieren pekte selv på spray-invite-hullet, og det er reelt: **hvem som helst innlogget kan venne-invitere inntil 10 adresser/døgn** (`lib/invitations/quota.ts:12` `DAILY_INVITE_LIMIT = 10` + RLS-policy `0008_player_friend_invites_rls.sql` som lar en hvilken som helst `auth.uid()` inserte `game_id IS NULL`-invitasjoner). En «slipp inviterte gjennom»-regel ville derfor åpne et throttlet bypass: en selvregistrert bruker venne-inviterer disposable-adresser for å slippe dem forbi blokken.

**Valg:** Disposable-domener blokkeres på `/login` når self-reg er på, **uavhengig av invitasjons-status**. Lukker spray-invite-hullet helt og gir en enklere regel. Kostnaden — at en eksplisitt invitert person på et engangsdomene ikke kommer inn — er i praksis null: admin/trusted-creators inviterer aldri mailinator-adresser, og siden blokken shipper FØR #364 noensinne skrur på flagget i prod, finnes det ingen eksisterende disposable-domene-konto å låse ute.

### Beslutning C — Liste-kilde: **vendret kuratert liste** (ingen ny npm-dep)

`disposable-email-domains`-pakken (~3600 domener) er ikke installert. I tråd med prosjektets minimalisme (hand-rolled SW, ingen unødvendige deps) og issuets «lean til vi ser misbruk»-filosofi: vendre en kuratert `Set` av de mest brukte disposable-tjenestene i repo. Dekker det store flertallet av reell misbruk, null supply-chain-flate, deterministisk å teste, trivielt å utvide. **Eskaleringssti** dokumentert: hvis et ukjent disposable-domene dukker opp i misbruk → legg til i lista (rask patch); hvis volum-misbruk fortsetter → bytt til npm-lista eller captcha (egen jobb, jf. issuets non-goals).

---

## 3. Design

### 3.1 Disposable-domene-helper (ny, ren logikk)

**`lib/auth/disposableDomains.ts`** — eksporterer `DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string>` med kuraterte, lowercase domener (mailinator.com, guerrillamail.com, 10minutemail.com, yopmail.com, temp-mail.org, getnada.com, trashmail.com, sharklasers.com, throwawaymail.com, maildrop.cc, dispostable.com, fakeinbox.com, mfsa.ru, m.l.no? nei — kun ekte disposable). Liste-kommentar forklarer kilde + at den utvides ved behov.

**`lib/auth/disposableEmail.ts`** — `export function isDisposableEmailDomain(email: string): boolean`:
- Trekk ut domene: alt etter siste `@`, trimmet og lowercased.
- Returner `false` hvis ingen `@`, tomt domene, eller flere `@` på en måte som gir tomt domene (defensivt — caller har allerede normalisert, men helperen står på egne ben).
- Returner `DISPOSABLE_EMAIL_DOMAINS.has(domain)`.
- Eksakt domene-match (ikke suffiks/subdomene-matching). De aktuelle tjenestene bruker base-domenet; subdomene-matching er bevisst utenfor scope (false-positive-risiko, marginal gevinst).

Ren funksjon, ingen I/O, ingen `server-only` nødvendig (men brukes server-side). Type A-testbar.

### 3.2 Innkobling i `sendCode`

Plasser disposable-sjekken **etter honeypot + rate-limit, før `email_is_invited`-RPC-en**:

```ts
const allowSelfReg =
  process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true';

// #365: når åpen selvreg er på, avvis kjente engangs-/disposable-domener
// uavhengig av invitasjons-status (lukker spray-invite-bypass via venne-
// invitasjoner — se kontrakt-beslutning B). Sjekken er gratis (Set-oppslag)
// og kortcircuiterer før vi bruker email_is_invited-RPC + Supabase OTP-kvote.
if (allowSelfReg && isDisposableEmailDomain(email)) {
  console.warn('[login/sendCode] disposable email rejected');
  redirect('/login?error=disposable_email');
}
```

- **Rekkefølge-rasjonale:** rate-limit kjører før disposable-sjekken slik at en disposable-spray fra én IP fortsatt brenner IP-bøtta. Disposable-sjekken før RPC + `signInWithOtp` sparer Supabase-kvote på et kjent-dårlig domene.
- **Gating på `allowSelfReg`:** matcher issuet («når selvreg er på»). Med flagget av (dagens prod) er oppførselen identisk med i dag — ingen ny avvisning i invitasjons-only-modus.
- `email` er allerede trimmet + lowercased øverst i `sendCode`.

### 3.3 Feilkode + norsk melding

Ny kode `disposable_email` i `ERROR_MESSAGES` (`app/(auth)/login/page.tsx`). Vennlig, brand-stemme (sporty kompis), kjøres gjennom `humanizer`-skillet før commit. Utkast (finaliseres ved bygging):

> «Den e-posten ser ut som en engangsadresse. Bruk en vanlig e-post (Gmail, Outlook, iCloud …), så er du i gang.»

---

## 4. Edge-cases

- **Self-reg AV + disposable-domene:** sjekken hoppes over (gated på flagget). Disposable-e-post som er eksisterende bruker logger inn som før; ukjent → `user_not_found` som før. Ingen regresjon.
- **Self-reg PÅ + invitert + disposable:** **blokkeres** (Beslutning B). Bevisst — lukker spray-invite-hullet.
- **Self-reg PÅ + normal e-post:** uendret flyt (RPC → OTP).
- **Eksisterende bruker med disposable-konto + self-reg PÅ:** ville blitt blokkert ved re-login. Finnes ikke ved aktivering (self-reg har aldri vært på i prod; blokken shipper før #364). Dokumentert tradeoff, ikke et reelt tilfelle.
- **Malformert e-post i helper (ingen `@`):** `isDisposableEmailDomain` returnerer `false` → flyten fortsetter til eksisterende tom-/format-håndtering. Helper kaster aldri.
- **Honeypot fylt + disposable:** honeypot kortcircuiterer først (uendret) — ingen disposable-sjekk, ingen DB-call.

---

## 5. Ikke i scope (eksplisitte non-goals)

- **Captcha / Turnstile / hCaptcha** — utsatt til faktisk misbruk (issuets non-goal, arv fra #166).
- **Stramme IP-taket** — vurdert og avvist (Beslutning A). Ingen verdiendring.
- **Domene-allowlist** — for restriktivt mot legitime norske adresser (avvist i #166).
- **Adferdsbasert bot-deteksjon** — issuets non-goal.
- **Subdomene-/suffiks-matching av disposable-domener** — eksakt match holder for de aktuelle tjenestene; suffiks-matching gir false-positive-risiko.
- **Disposable-blokk på andre invite-/signup-flater** (`/profile` venne-invite, admin-invite, game-signup) — denne kontrakten dekker `/login`-vektoren. Blokken på `/login` fanger uansett alle som forsøker å *logge inn* med en disposable-adresse, så en disposable-invitasjon dør ved innloggings-steget.

---

## 6. Filer som endres

| Fil | Endring |
|---|---|
| `lib/auth/disposableDomains.ts` | **Ny** — kuratert `Set<string>` av disposable-domener. |
| `lib/auth/disposableEmail.ts` | **Ny** — `isDisposableEmailDomain(email)`-helper. |
| `lib/auth/disposableEmail.test.ts` | **Ny** — Type A `it.each`-parametrisert. |
| `app/(auth)/login/actions.ts` | `sendCode`: disposable-sjekk etter rate-limit, gated på `allowSelfReg`. |
| `app/(auth)/login/actions.test.ts` | Nye behavioral-tester (block/ikke-block per flagg + invitert). |
| `app/(auth)/login/page.tsx` | Ny `disposable_email`-nøkkel i `ERROR_MESSAGES`. |
| `package.json` + `CHANGELOG.md` | MINOR-bump (1.72.0 → 1.73.0) + oppføring (dormant, aktiveres med #364). |

**Ingen DB-migrasjon.** **Ingen ny npm-dep.**

---

## 7. Gates (kjøres scoped til endringen)

1. **Typecheck:** `npx tsc --noEmit` → 0 feil.
2. **Co-located tester:** `npx vitest run lib/auth/disposableEmail.test.ts "app/(auth)/login/actions.test.ts" lib/auth/loginRateLimit.test.ts` → alle grønne.
3. **Lint (ny kode):** `npm run lint` → ingen nye feil i berørte filer.
4. **Commit-msg-hook:** `feat(auth)`-commit passerer kun med staged `package.json` (endret version) + `CHANGELOG.md`.

---

## 8. Suksesskriterier (evidens før avkrysning)

- [x] **K1 — Helper-logikk korrekt.** `isDisposableEmailDomain` returnerer `true` for kjente disposable-domener (case-insensitivt), `false` for normale (gmail/outlook/icloud/online.no/bedrifts-domener) og for malformert input. *Evidens:* `lib/auth/disposableEmail.test.ts` — **26 tester grønne**; `it.each` dekker 10 disposable→true, 8 normale→false, casing (`Spam@MailInator.COM`→true), trim, eksakt-match (`notmailinator.com`→false, `mailinator.com.evil.no`→false), 5 malformerte→false uten kast.
- [x] **K2 — Block når self-reg PÅ.** Med `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION=true` og disposable-domene redirecter `sendCode` til `?error=disposable_email` UTEN å kalle `email_is_invited`-RPC eller `signInWithOtp`. *Evidens:* `actions.test.ts` «blocks a known disposable domain when self-reg is on» grønn — asserter `lastRedirect()==='/login?error=disposable_email'` + `rpcMock` og `signInWithOtpMock` **not.toHaveBeenCalled()**. Kode: `app/(auth)/login/actions.ts:59-72`.
- [x] **K3 — Block uavhengig av invitasjon.** Disposable blokkeres også når e-posten ville vært invitert. *Evidens:* `actions.test.ts` «blocks disposable domains regardless of invitation status» grønn — `rpcMock` returnerer `{data:true}` (would-be invited), likevel redirect `disposable_email` + `signInWithOtp` ikke kalt.
- [x] **K4 — Ingen regresjon når self-reg AV.** Med flagget `false` + disposable-domene gjøres INGEN disposable-redirect; flyten fortsetter til RPC/OTP. *Evidens:* `actions.test.ts` «does not block disposable domains when self-reg is off» grønn — `lastRedirect()` ≠ `disposable_email`, `signInWithOtp` kalt 1×.
- [x] **K5 — Normal e-post uberørt.** Self-reg PÅ + normal e-post → uendret flyt. *Evidens:* eksisterende «passes shouldCreateUser=true for a non-invited email when the flag is on» + alle 21 `actions.test.ts`-tester grønne (54 totalt på tvers av de tre filene).
- [x] **K6 — Norsk melding vist.** *Evidens:* `app/(auth)/login/page.tsx` `ERROR_MESSAGES.disposable_email = 'Engangs-e-post går ikke. Bruk en vanlig e-postadresse, så er du i gang.'` — humanizer-kjørt (kortet ned fra 2-setnings-utkast, sporty-kompis-stemme, ingen em-dash).
- [x] **K7 — IP-tak uendret + dokumentert.** *Evidens:* `git diff` rører ikke `lib/auth/loginRateLimit.ts` (ingen endring i `ipMax = 10`-default); beslutning dokumentert i Beslutning A + CHANGELOG `#### Decided`.
- [x] **K8 — Gates grønne.** *Evidens:* `npx tsc --noEmit` → `TSC_EXIT=0`; `npx vitest run` (3 filer) → **54 passed**; `eslint` på 6 berørte filer → `ESLINT_EXIT=0`; `package.json` 1.72.0→**1.73.0**; CHANGELOG 1.73.y-serie lagt til, 1.72.y kollapset.

---

## 9. Test-plan (per `docs/test-discipline.md`)

- **Type A (ren logikk)** — `lib/auth/disposableEmail.test.ts`: `it.each` over disposable→true / normal→false / casing / malformert. Assertion-rik, klassisk TDD (test først, rød, implementer, grønn).
- **Behavioral (utvid eksisterende `actions.test.ts`)** — K2/K3/K4: følger filens etablerte mønster (mock `consumeLoginRateLimit`/`signInWithOtp`/`rpc`, assert redirect + ikke-kall). Ingen ny mock-fil, ingen kopiert oppsett. Maks de testene K2–K5 krever — ingen «mens jeg var her»-tester.
- **Ingen Type C/D** — ren server-action + logikk, ingen ny UI-komponent eller E2E-flyt.
