# Netto Helper-Tekst Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Erstatte helper-tekst-logikken på `ScoreCard` så hver spillers kort viser «Netto X» når score er satt (eller tom slot i reveal-active mode), og fjerne to elementer død/redundant kopi i samme slengen.

**Architecture:** Punktendring i `components/hole/ScoreCard.tsx` — helper-tekst-grenen erstattes med tre-tilstands-regel (`null`-score → instruksjon, `hideNetto` → tom, ellers → `Netto X`). Ingen API-endring, ingen ny prop. Tester i `components/hole/ScoreCard.test.tsx` byttes ut for de tre tilstandene.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react.

**Design-doc:** [`docs/plans/2026-05-16-issue-19-netto-helper-tekst-design.md`](./2026-05-16-issue-19-netto-helper-tekst-design.md)

**Issue:** [#19](https://github.com/jdlarssen/golf-app/issues/19)

**Subagent-modell:** Opus (per memory `feedback_subagent_model_routing`).

**Bumpe-type:** PATCH `1.0.9 → 1.0.10`.

---

## Task 1: Rydde og oppdatere `ScoreCard.test.tsx`

Forberedelse — først legges nye failing tester inn og foreldede slettes, så vi vet hva implementasjonen skal lande på.

**Files:**
- Modify: `components/hole/ScoreCard.test.tsx`

**Step 1: Slett foreldede helper-text-tester**

I `components/hole/ScoreCard.test.tsx`, fjern disse tre testene i `describe('ScoreCard — helper text', ...)`-blokken (linje 82–92):

```ts
it('confirmed shows Bekreftet helper', () => {
  setup({ score: 4, confirmed: true });
  expect(screen.getByText('Bekreftet')).toBeInTheDocument();
});

it('score set but not confirmed shows adjusted helper', () => {
  setup({ score: 5, confirmed: false });
  expect(
    screen.getByText('Justert · tap igjen for å bekrefte'),
  ).toBeInTheDocument();
});
```

«unset shows buttons helper»-testen (linje 77–80) beholdes uendret. «confirmed border color differs from unconfirmed»-testen (linje 94–100) beholdes — den tester border-farge, ikke tekst.

**Step 2: Legg til nye helper-text-tester**

Innenfor samme `describe('ScoreCard — helper text', ...)`-blokk, legg til etter «unset shows buttons helper»:

```ts
it('viser «Netto X» når score er satt med positive ekstra slag', () => {
  setup({ score: 5, extraStrokes: 2, confirmed: true });
  expect(screen.getByText('Netto 3')).toBeInTheDocument();
});

it('viser «Netto X» når score er satt uten ekstra slag (X = score)', () => {
  setup({ score: 5, extraStrokes: 0, confirmed: true });
  expect(screen.getByText('Netto 5')).toBeInTheDocument();
});

it('viser «Netto X» med høyere X for plus-golfere (negative ekstra slag)', () => {
  setup({ score: 5, extraStrokes: -1, confirmed: true });
  expect(screen.getByText('Netto 6')).toBeInTheDocument();
});

it('skjuler netto-tekst når hideNetto er true (reveal-active)', () => {
  setup({ score: 5, extraStrokes: 2, hideNetto: true, confirmed: true });
  expect(screen.queryByText(/Netto/)).not.toBeInTheDocument();
  expect(screen.queryByText('Bekreftet')).not.toBeInTheDocument();
});

it('viser instruksjon-tekst når score er null uavhengig av extraStrokes', () => {
  setup({ score: null, extraStrokes: 3 });
  expect(screen.getByText('Tap kort = par. Bruk − / +.')).toBeInTheDocument();
  expect(screen.queryByText(/Netto/)).not.toBeInTheDocument();
});
```

**Step 3: Kjør testene og bekreft at alle nye feiler**

```bash
npm test -- components/hole/ScoreCard.test.tsx --reporter=verbose
```

Forventet: De 5 nye testene feiler («Netto 3» finnes ikke i DOM osv.). De gamle ScoreCard-testene som ikke ble endret skal fortsatt passere.

Forventede feilmeldinger inkluderer noe à la:
```
Unable to find an element with the text: Netto 3
```

**Step 4: Ikke commit ennå** — tester alene må ikke pushes uten implementasjon.

---

## Task 2: Implementere ny helper-text-logikk i `ScoreCard.tsx`

Erstatte den nåværende `if/else if/else`-grenen i helper-tekst-blokken med ny tre-tilstands-regel.

**Files:**
- Modify: `components/hole/ScoreCard.tsx`

**Step 1: Erstatte helper-text-utregningen**

I `components/hole/ScoreCard.tsx`, lokaliser denne blokken (linje 180–187):

```ts
let helperText: string;
if (confirmed) {
  helperText = 'Bekreftet';
} else if (score == null) {
  helperText = 'Tap kort = par. Bruk − / +.';
} else {
  helperText = 'Justert · tap igjen for å bekrefte';
}
```

Erstatt med:

```ts
let helperText: string;
if (score == null) {
  helperText = 'Tap kort = par. Bruk − / +.';
} else if (hideNetto) {
  helperText = '';
} else {
  helperText = `Netto ${score - extraStrokes}`;
}
```

**Step 2: Sjekk at `helperStyle` rendrer korrekt med tom streng**

Linje 233 rendrer helper-teksten:
```tsx
<div style={helperStyle}>{helperText}</div>
```

Tom streng vil rendre som en tom `<div>` — det fungerer (tar plassen i layout, ingen synlig tekst). Det er ønsket oppførsel for reveal-active.

**Step 3: Kjør test-suite for ScoreCard på nytt**

```bash
npm test -- components/hole/ScoreCard.test.tsx --reporter=verbose
```

Forventet: Alle tester passerer (inkludert de 5 nye fra Task 1 og de gjenstående gamle).

**Step 4: Kjør full vitest-suite**

```bash
npm test
```

Forventet: Alle tester passerer. Sjekk spesielt at `HoleClient.test.tsx` ikke ble berørt (den bruker `confirmed = score != null`-derivasjonen som-er).

**Step 5: Kjør lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Forventet: Ingen nye warnings/errors. (Eksisterende warnings i `historikk/page.tsx`, `InstallBanner.tsx`, `SyncBanner.tsx` er ikke berørt.)

---

## Task 3: Bump versjon, oppdater CHANGELOG, og commit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (skjer automatisk via npm version)
- Modify: `CHANGELOG.md`

**Step 1: Bump til v1.0.10**

```bash
npm version patch --no-git-tag-version
```

Forventet output: `v1.0.10`. Sjekk at `package.json` har `"version": "1.0.10"` og `package-lock.json` er oppdatert.

**Step 2: Legg til CHANGELOG-entry**

I `CHANGELOG.md`, finn nyeste minor-serie-heading (`## 1.0.y — ...` eller liknende) og legg til entry på toppen, under heading-en:

```markdown
### [1.0.10] - 2026-05-16

**Du ser nå netto-tallet ditt diskret under navnet på hvert hull, så du slipper å regne i hodet — også som plus-golfer.**

<details>
<summary>Teknisk</summary>

#### Changed
- `ScoreCard` helper-tekst viser nå «Netto X» (= score − extraStrokes) når score er satt, i stedet for «Bekreftet». Konsistent for plus-, scratch- og handicap-spillere.
- Helper-slot er tom i reveal-active mode (samme regel som `+N SLAG`-badgen som allerede skjules der).

#### Removed
- Unreachable «Justert · tap igjen for å bekrefte»-grenen i helper-tekst-logikken (rester fra ikke-implementert to-stegs flyt).
- «Bekreftet»-teksten — den dupliserte signalet fra gylden border + sync-pulse-linje.

</details>
```

Sjekk om eksisterende CHANGELOG har v1.0-serien åpen eller wrappet i `<details>`. Hvis åpent: bare legg entry til. Hvis wrappet (3+ minor-serier åpne): pakk eldste serie inn i `<details>` per CLAUDE.md-regelen og åpne 1.0-serien.

**Step 3: Stage og commit alt sammen**

Alle endringer er logisk sammenhengende (test + impl + bump + CHANGELOG) — ett commit:

```bash
git add components/hole/ScoreCard.tsx \
        components/hole/ScoreCard.test.tsx \
        package.json \
        package-lock.json \
        CHANGELOG.md
```

```bash
git commit -m "$(cat <<'EOF'
fix(score-card): vis «Netto X» som helper-tekst på hull-skjermen

Erstatter «Bekreftet»-kopien med netto-tallet når score er satt
(inkludert plus-golfere med negative ekstra slag). Helper-slot er
tom i reveal-active mode for å holde netto skjult der, akkurat
som +N SLAG-badgen.

Rydder samtidig opp i ScoreCard:
- Fjernet unreachable «Justert · tap igjen for å bekrefte»-grenen
  i helper-text-logikken (rester fra to-stegs-flyt som aldri ble
  implementert; caller setter alltid confirmed = score != null).
- Fjernet «Bekreftet»-strengen — gylden border + sync-pulse-linje
  signaliserer allerede at scoren er lagret.

Tester:
- Slettet «Bekreftet»- og «Justert»-tester (testet kopi som ikke
  lenger eksisterer).
- Lagt til 5 nye tester for Netto-tekst (positive/null/negative
  extraStrokes), reveal-active-skjuling, og null-score-instruksjon.

Closes #19
EOF
)"
```

Hooken (`commit-msg`) sjekker at `package.json` har bumpet version + at `CHANGELOG.md` er staget. Begge er på plass.

**Step 4: Verifiser commit-status**

```bash
git status && git log -1 --stat
```

Forventet: Working tree clean, siste commit lister 5 endrede filer (eller 6 hvis package-lock.json bumpet).

---

## Task 4: Push til main og lukk issue

Dette gjøres fra hovedchatten (jeg), ikke av subagent — krever GitHub-state-håndtering per workflow-regelen.

**Step 1: Merge worktree-branch til main og push**

Vi er på `claude/compassionate-murdock-9fe381` worktree. Vercel deployer fra main, så endringen må lande på main:

```bash
git -C /Users/jdl/Dokumenter/GitHub/golf-app fetch origin main
git -C /Users/jdl/Dokumenter/GitHub/golf-app checkout main
git -C /Users/jdl/Dokumenter/GitHub/golf-app pull --ff-only
git -C /Users/jdl/Dokumenter/GitHub/golf-app merge --ff-only claude/compassionate-murdock-9fe381
git -C /Users/jdl/Dokumenter/GitHub/golf-app push origin main
```

(Hvis fast-forward ikke er mulig, kommer det opp merge-konflikt — håndteres da.)

`Closes #19` i commit-body utløser GitHub auto-close ved push.

**Step 2: Verifiser at issue #19 er lukket automatisk**

```bash
gh issue view 19 --repo jdlarssen/golf-app --json state,closedAt,title
```

Forventet: `"state": "CLOSED"`. Hvis ikke (kan skje hvis GitHub er treg): lukk manuelt med `gh issue close 19`.

**Step 3: Poste closing-kommentar på issue #19**

Per `CLAUDE.md` GitHub Issues-workflow — mandatory:

```bash
gh issue comment 19 --repo jdlarssen/golf-app --body "$(cat <<'EOF'
## Teknisk

- `components/hole/ScoreCard.tsx`: helper-text-logikken byttet ut med tre-tilstands-regel — `score == null` → instruksjon, `hideNetto` → tom streng, ellers → `Netto X` (X = `score - extraStrokes`).
- Fjernet unreachable `else { helperText = 'Justert · tap igjen for å bekrefte' }`-grenen og «Bekreftet»-strengen.
- `components/hole/ScoreCard.test.tsx`: slettet tester for «Bekreftet»/«Justert», la til 5 nye dekninger (positive/null/negative extraStrokes, hideNetto-skjuling, null-score-instruksjon).
- PATCH-bump til `v1.0.10` + CHANGELOG-entry.
- Commit: <commit-sha-fylles-inn>

## For Jørgen

Du ser nå **netto-tallet ditt** under navnet på hvert spillerkort på hull-skjermen — for eksempel «Netto 3» når du har scoret 4 med 1 slag fått. Slipper å regne det i hodet selv. Det vises også for plus-golfere som «gir tilbake» et slag på hullet (Netto > brutto da). I skjult-modus (når admin har valgt at netto-tall skal avsløres ved spillslutt) er linja tom — akkurat som «+N SLAG»-merket allerede er skjult der.
EOF
)"
```

Erstatt `<commit-sha-fylles-inn>` med den faktiske SHA-en fra commiten i Task 3.

**Step 4: Markere issue-en visuelt sjekket**

```bash
gh issue view 19 --repo jdlarssen/golf-app
```

Forventet: State er `CLOSED`, siste kommentar er closing-kommentaren over.

---

## Verifisering

Etter Task 4 er ferdig:

- [ ] Issue #19 er `CLOSED` på GitHub
- [ ] Closing-kommentaren er postet med både `Teknisk` og `For Jørgen`-seksjoner
- [ ] Vercel-deploy har trigget på main-push (sjekk Vercel-dashboard hvis usikker)
- [ ] Brukeren kan teste i prod på neste runde
