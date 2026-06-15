# Forge-evaluering: #645 — Klubb-skjema beholder felt ved valideringsfeil

**VERDICT: ACCEPT**

Evaluator: skeptical forge evaluator (independent re-check, no trust of implementer claims)
Date: 2026-06-15
Commit: `8610d61d`

---

## Per-kriterium funn

### K1 — Opprett klubb beholder alle felt

**PASS.**

`createClubForAdmin` (`app/[locale]/admin/klubber/ny/actions.ts:61-68`) innfører en `errorHref(code)`-helper som bygger searchParams-URL med alle 5 felt:

- `name` (linje 63) — betinget (`if (name)`)
- `email` = owner_email (linje 64) — betinget
- `member_cap` (linje 65) — betinget (raw string, ikke parseInt)
- `varighet_mode` (linje 66) — betinget
- `sluttdato` (linje 67) — betinget

Alle **7** feil-grener kaller `errorHref()`:
- `not_auth` (linje 70), `name_req` (linje 71), `too_long` (linje 72), `email_req` (linje 73), `cap_invalid` (linje 74), `owner_not_found` (linje 75), `unknown` (linje 77)

`ny/page.tsx` leser dem tilbake (`linje 50–53`):
- `prevName = first(sp.name) ?? ''` → `defaultValue={prevName}` på name-Input (linje 82)
- `errorEmail = first(sp.email)` → `defaultValue={errorEmail ?? ''}` på owner_email-Input (linje 92)
- `prevMemberCap = first(sp.member_cap) ?? ''` → `defaultValue={prevMemberCap}` på member_cap-Input (linje 103)
- `prevVarighetMode` → `defaultMode={prevVarighetMode}` på VarighetField (linje 108)
- `prevSluttdato` → `defaultDate={prevSluttdato}` på VarighetField (linje 108)

`VarighetField` (`app/[locale]/admin/klubber/VarighetField.tsx:28-29`) initialiserer `useState(defaultMode)` og `useState(defaultDate)` — props leses ved mount, noe som er korrekt for server-action/redirect-runden (siden hele siden re-renders etter redirect).

Kontraktens kravsreferanse (`actions.ts:60-79`, `page.tsx:48-55, 70-100`) bekreftet mot faktisk kode — linjenumrene stemmer.

### K2 — Legg til medlem beholder e-post

**PASS med ett bemerket unntak som er praktisk ureachable.**

`klubber/[id]/page.tsx:324` — `defaultValue={errorEmail ?? ''}` på member-email-Input er lagt til. Lest inn via `errorEmail = first(sp.email)` (linje 95).

`addMember` (`app/[locale]/klubber/[id]/actions.ts`) — echoing-oversikt per gren:

| Linje | Kode | Email echoet? | Reachable? |
|-------|------|---------------|------------|
| 40 | `email_req` (tom email) | Nei — email er tom | Ja |
| 50 | `not_auth` | Nei | Praktisk nei — UI viser skjema kun for isAdmin |
| 53 | `email_req` (fra RPC) | Nei | Praktisk nei — linje 40-guard hindrer dette |
| 56 | `unknown` | Ja (`&email=...`) | Ja |
| 60 | `not_found` | Ja | Ja |
| 63 | `already_member` | Ja | Ja |
| 66 | `club_full` | Ja | Ja |
| 69 | `club_expired` | Ja | Ja |

De to bransjene uten email-echo (`not_auth` og RPC `email_req`) er praktisk ureachable: `not_auth` krever at RLS blokkerer en bruker som UI-en allerede gater bort; `email_req` fra RPC kan ikke brenne etter linje 40's tomtstreng-sjekk. Kontrakten nevner eksplisitt `full`/`expired`/`unknown` som de kritiske — alle tre echoer email.

Ingen reell UX-degradering.

### K3 — Suksess-sti uendret

**PASS.**

`createClubForAdmin` (linje 81-82):
```
revalidatePath('/admin/klubber')
redirect({ href: `/admin/klubber/${data}`, locale })
```

`addMember` (linje 73-74):
```
revalidatePath(`/klubber/${groupId}`)
redirect({ href: `/klubber/${groupId}?added=${encodeURIComponent(email)}`, locale })
```

Ingen av suksess-stiene er endret. `git show 8610d61d --stat` bekreftet at `addMember` kun endret 6 linjer (linje 50-69 i actions.ts); suksess-redirect på linje 73-74 er identisk.

### K4 — Ingen lekkasje

**PASS.**

Alle echo-params leses via `first(sp.x) ?? ''` — gir `''` ved manglende param (fresh load). På frisk lasting er alle `prev*`-variabler tomme strenger eller `'uendelig'` (som er VarighetFields korrekte startverdi). Suksess-redirectene går til en annen rute (`/admin/klubber/${id}`) så ingen params kan persistere. URL-crafting (manuell navigasjon til `?name=X`) er en teoretisk omvei, men samsvarer med eksisterende mønster i hele kodebasen og er utenfor kontraktens scope.

### K5 — Norsk copy

**PASS.**

Ingen nye UI-strenger — eksisterende labels gjenbrukt. CHANGELOG-tagline (`1.130.6`):

> Oppretter du en klubb og noe er feil — for eksempel en eier-e-post uten Tørny-konto — tømte skjemaet alle feltene, og du måtte taste klubbnavn, e-post og resten på nytt. Nå står det du skrev igjen, så du bare retter feltet som var galt. Samme på «Legg til medlem» i klubben.

Ingen AI-tells: ingen «vennligst», ingen em-dash-kjeder, ingen «du kan nå»-konstruksjon, ingen passiv voice-dominans. Teksten bruker aktiv norsk («tømte», «retter», «Nå står»). One em-dash er kanonisk mønster (brand-tagline-tillatt). Hook-commit-msg passerte, noe som indikerer at CHANGELOG.md ble staged.

---

## Gate-resultater

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | **Exit 0** — ingen type-feil |
| Co-lokaliserte tester (`ClubLeaguesSection.test.tsx`, `ClubCupsSection.test.tsx`) | **8/8 passed** |
| Ingen co-lokaliserte tester i `admin/klubber/ny/` | — (ingen eksisterende; E2E-territorium, ingen ny test påkrevd per kontrakt) |

Playwright-test mot kjørende app er ikke mulig uten database. Verifisert via statisk lesning + TypeScript-kompilering, som kontrakten spesifiserer.

---

## Ytterligere funn (ikke blokkerende)

**`member_cap` echoes som raw string, ikke parsed int.**
`memberCapRaw` (linje 39) sendes som searchParams-string, leses tilbake som `prevMemberCap` og settes som `defaultValue` på `<Input type="number">`. Dette er korrekt — `defaultValue` på number-input tar en string, og browseren behandler den riktig.

**`varighet_mode`-normalisering i page.tsx (linje 52):**
```typescript
const prevVarighetMode = first(sp.varighet_mode) === 'dato' ? 'dato' : 'uendelig';
```
Whitelist-normalisering — kun `'dato'` gir `'dato'`, alt annet (inkl. manipulert verdi) gir `'uendelig'`. Korrekt og defensivt.

**`VarighetField` og `useState(defaultProps)`-mønster:**
På en fresh redirect-render fungerer dette korrekt fordi Next.js server-renderer en ny side per redirect — `useState(defaultMode)` initialiseres med den echoed verdien. Ingen stale-state-felle her (det ville bare være relevant ved klient-navigasjon uten remount).

**Version bump:** `package.json` gikk fra 1.130.5 → 1.130.6 i samme commit. Hook passerte. CHANGELOG-entry korrekt nøstet under `## 1.130.y — Lag-matchplay uten cup`.

---

## Konklusjon

Alle 5 success-kriterier oppfylt. Gates grønne. Ingen missing-echo-bugs som kan nå en bruker i praksis. Implementasjonen er konsistent med eksisterende searchParams-echo-mønster i kodebasen (`app/[locale]/admin/spillere/actions.ts`).

**VERDICT: ACCEPT**
