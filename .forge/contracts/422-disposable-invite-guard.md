# Kontrakt: #422 — Guard disposable-domener på de bruker-drevne invite-flatene

**Issue:** [#422](https://github.com/jdlarssen/golf-app/issues/422)
**Milestone:** Tier 5 — Åpen selvregistrering
**Branch:** `issue-422-disposable-invite-guard`
**Type:** `fix(auth)` — herding, lukker residual disposable-via-invite-vektor + døde rader

---

## 1. Bakgrunn

Code-review-funn fra #365: disposable-blokken dekker `/login` (der kontoer faktisk opprettes), men invite-flatene guard-er ikke engangs-domener. Konsekvens:
- **Self-reg PÅ:** en venne-/lag-invitert disposable-adresse blir blokkert ved innlogging (#365), men invitasjonen lager først en **død `invitations`-rad + en bortkastet mail** til en innboks som aldri kan logge inn.
- **Self-reg AV:** en invitert disposable-adresse blir `email_is_invited`→true, så `/login` slipper den gjennom (#365-blokken er gated på flagget). Da kan en innlogget bruker faktisk opprette throwaway-kontoer via offentlige disposable-innbokser (inntil venne-kvoten 10/døgn).

Helperen [`isDisposableEmailDomain`](lib/auth/disposableEmail.ts) finnes allerede (fra #365, 26 tester grønne) — denne kontrakten gjenbruker den.

---

## 2. Beslutninger fra gray-area-diskusjon (eier, 2026-06-04)

### Beslutning A — Omfang: kun de **bruker-drevne** flatene (IKKE admin)

Fire flater inserter `invitations`-rader for potensielt nye e-poster:

| Flate | Hvem | Guard? |
|---|---|---|
| `sendFriendInvite` ([app/invite/actions.ts](app/invite/actions.ts)) | hvilken som helst innlogget bruker (kvote 10/døgn) | ✅ Ja |
| `submitTeamRegistration` co-player-slots ([teamActions.ts](app/signup/[shortId]/teamActions.ts)) | lag-kaptein (innlogget bruker) | ✅ Ja |
| `sendInvitation` ([admin/spillere/actions.ts](app/admin/spillere/actions.ts)) | admin (`requireAdmin`) | ❌ Nei |
| `inviteEmailToGame` ([inviteToGameActions.ts](app/admin/games/[id]/inviteToGameActions.ts)) | admin / trusted-creator | ❌ Nei |

**Avvik fra issue-tittelen** («venne-/**admin**-invite-flatene»): eieren besluttet at admin IKKE trenger vernet — admin er betrodd, og «arrangør»-rollen (trusted-creator) er på vei ut (mot #22 demokratisert opprettelse). Vi guard-er derfor kun de to flatene som hvem-som-helst-brukere driver. Spray-vektoren bor uansett der (admin/trusted-creator er curated).

### Beslutning B — Alltid på (ikke gated på self-reg-flagget)

Ulikt `/login`-blokken (#365, gated på `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`), er invite-guarden **alltid aktiv**. En engangs-invitasjon gir aldri verdi uansett flagg-status: self-reg PÅ → død rad + bortkastet mail; self-reg AV → reell throwaway-konto-vektor. Begge lukkes av en ugated guard.

---

## 3. Design

Begge guards er **validerings-stegs-avvisninger** plassert i hver flates eksisterende valideringsmønster — ingen ny mekanikk, bare et `isDisposableEmailDomain`-kall + flatens native feil-retur.

### 3.1 `sendFriendInvite` (app/invite/actions.ts)

Etter den eksisterende `looksLikeEmail`-sjekken (linje ~22-24), før DB-arbeid:

```ts
if (isDisposableEmailDomain(email)) {
  redirect('/profile?invite_error=disposable_email');
}
```

Ny `disposable_email`-nøkkel i `INVITE_ERROR`-map i [app/profile/page.tsx](app/profile/page.tsx) (ved siden av `invalid_email`/`already_invited`).

### 3.2 `submitTeamRegistration` (app/signup/[shortId]/teamActions.ts)

I den eksisterende pre-validerings-loopen (linje ~245-257) som aborterer hele submission-en på første dårlige slot:

```ts
if (isDisposableEmailDomain(slot.value)) {
  return { ok: false, error: 'disposable_email' };
}
```

Plasseres rett etter `!slot.value || !slot.value.includes('@')`-sjekken. Konsistent med hvordan invalid/duplikat/selv-slots allerede aborterer hele laget. Ny `disposable_email`-nøkkel i team-klientkomponentens feilmelding-map (samme sted som `duplicate_emails`/`self_in_slots`).

### 3.3 Norsk copy (humanizer-kjørt)

Utkast (finaliseres ved bygging):
- Friend: «Engangs-e-post går ikke. Be vennen om en vanlig e-postadresse.»
- Team: «Engangs-e-post går ikke. Bruk en vanlig e-postadresse for medspilleren.»

---

## 4. Edge-cases

- **Eksisterende bruker med disposable-domene-konto inviteres:** Friend-flyten dedup-er på `email_is_registered`/`email_is_invited` FØR/rundt guarden; men guarden plasseres tidlig (etter format-sjekk), så en disposable-adresse avvises før dedup uansett. Akseptabelt — en eksisterende disposable-konto er et ikke-tilfelle (ingen finnes; #365 + denne lukker opprettelse).
- **Team: én disposable slot blant flere gyldige:** hele submission-en avvises med `disposable_email` (konsistent med eksisterende «én dårlig slot aborterer alt»-mønster). Kapteinen retter adressen og sender på nytt.
- **Admin inviterer disposable:** tillatt (Beslutning A). Hvis det blir et problem senere, er guarden ett `isDisposableEmailDomain`-kall unna i de to admin-flatene.
- **Helper på malformert input:** `isDisposableEmailDomain` er total (returnerer false, kaster aldri) — eksisterende format-validering i hver flate fanger tomme/ugyldige adresser før guarden uansett.

---

## 5. Ikke i scope

- **Admin- og trusted-creator-flatene** (`sendInvitation`, `inviteEmailToGame`) — eier-beslutning A.
- **Klient-side inline-validering** av disposable i lag-skjemaet (#362-validatoren) — server-guarden er sikkerhetsgrensen; inline er polish, kan legges på senere.
- **Captcha / adferdsdeteksjon** — arv fra #365/#166 non-goals.
- **Ny helper / liste-utvidelse** — gjenbruker #365-helperen som den er.

---

## 6. Filer som endres

| Fil | Endring |
|---|---|
| `app/invite/actions.ts` | `sendFriendInvite`: disposable-guard etter format-sjekk. |
| `app/invite/actions.test.ts` | Ny behavioral-test (disposable → redirect, ingen insert/mail). |
| `app/profile/page.tsx` | Ny `disposable_email`-feilmelding i invite-error-map. |
| `app/signup/[shortId]/teamActions.ts` | Pre-validerings-guard på co-player-slots. |
| `app/signup/[shortId]/teamActions.test.ts` | Ny behavioral-test (disposable slot → `{ok:false, error:'disposable_email'}`). |
| `app/signup/[shortId]/*Client*.tsx` (team-skjema) | Ny `disposable_email`-feilmelding i error-map. |
| `package.json` + `CHANGELOG.md` | PATCH-bump (1.73.0 → 1.73.1) + oppføring. |

**Ingen DB-migrasjon. Ingen ny dep. Ingen ny helper.**

---

## 7. Gates

1. **Typecheck:** `npx tsc --noEmit` → 0 feil.
2. **Co-located tester:** `npx vitest run "app/invite/actions.test.ts" "app/signup/[shortId]/teamActions.test.ts"` → grønne.
3. **Lint:** `npm run lint` på berørte filer → rent.
4. **Commit-msg-hook:** `fix(auth)` passerer med staget `package.json` (endret version) + `CHANGELOG.md`.

---

## 8. Suksesskriterier (evidens før avkrysning)

- [ ] **K1 — Friend-invite blokkerer disposable.** Disposable e-post i `sendFriendInvite` → redirect `/profile?invite_error=disposable_email`, INGEN `invitations`-insert, INGEN mail. *Verifikasjon:* ny test i `app/invite/actions.test.ts`.
- [ ] **K2 — Friend-feilmelding vist.** `disposable_email` mapper til vennlig norsk tekst i `app/profile/page.tsx`. *Verifikasjon:* map-oppføring + tekst lest.
- [ ] **K3 — Team co-player blokkerer disposable.** Disposable slot-e-post → `submitTeamRegistration` returnerer `{ok:false, error:'disposable_email'}`, INGEN captain/co-player/invitations-insert. *Verifikasjon:* ny test i `teamActions.test.ts`.
- [ ] **K4 — Team-feilmelding vist.** `disposable_email` mapper til norsk tekst i team-klientkomponenten. *Verifikasjon:* map-oppføring lest.
- [ ] **K5 — Admin-flatene uendret.** `sendInvitation` + `inviteEmailToGame` har INGEN disposable-guard (Beslutning A). *Verifikasjon:* `git diff` rører ikke disse mht. disposable.
- [ ] **K6 — Alltid på.** Ingen `NEXT_PUBLIC_ALLOW_SELF_REGISTRATION`-gating rundt de nye guards. *Verifikasjon:* kode lest.
- [ ] **K7 — Gates grønne.** Typecheck + co-located tester + lint passerer; PATCH-bump + CHANGELOG.

---

## 9. Test-plan (per `docs/test-discipline.md`)

- **Ingen ny helper-test** — `isDisposableEmailDomain` er allerede dekket (#365, 26 tester).
- **Behavioral (Type-nær), utvid eksisterende filer:**
  - `app/invite/actions.test.ts` — K1: følger filens mock-mønster, asserter redirect + ingen insert/mail.
  - `app/signup/[shortId]/teamActions.test.ts` — K3: følger filens mønster (honeypot-testen finnes alt), asserter `{ok:false, error:'disposable_email'}` + ingen insert.
- **Ingen Type C/D** — ingen ny UI-komponent eller E2E-flyt; kun server-guards + feilmelding-strenger.
