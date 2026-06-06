# Laster-tilstand på server-action-knapper (app-wide) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gi alle ~50 server-action-knapper en ensartet laster-tilstand — teksten bytter til presens («Lagrer …»), knappen blir disabled, liten spinner foran — via én delt primitiv.

**Architecture:** Laster-visualen bor ett sted (`Button` med `pending`/`pendingLabel`). To mekanismer mater den: `SubmitButton` (leser `useFormStatus()`) for `<form action>`-flyter, og `pending`-propen direkte for `onClick`/`useTransition`-knapper. En delt `Spinner` brukes begge steder.

**Tech Stack:** Next.js 16 (App Router), React 19 (`useFormStatus`/`useTransition`), TypeScript, Tailwind v4, Vitest + Testing Library.

**Design:** [docs/plans/2026-06-06-laster-tilstand-app-wide-design.md](2026-06-06-laster-tilstand-app-wide-design.md)

---

## Conversion Recipe (delt — hver sweep-task refererer hit)

To mekanismer. Avgjør per knapp ved å se hvordan server-action-en trigges.

### A) `<form action={serverAction}>` submit-knapp → `SubmitButton`

Før:
```tsx
import { Button } from '@/components/ui/Button';
// ...
<Button type="submit" variant="primary">Lagre</Button>
```
Etter:
```tsx
import { SubmitButton } from '@/components/ui/SubmitButton';
// ...
<SubmitButton variant="primary" pendingLabel="Lagrer …">Lagre</SubmitButton>
```
- `SubmitButton` er `'use client'`. Den MÅ rendres inni `<form>`. Hvis dagens
  `<Button type="submit">` ligger i en server-komponent-fil, er `SubmitButton`
  (klient) den naturlige grensen — den fungerer som barn av `<form>` uansett.
- Behold `variant`, `className`, `name`, `value`, evt. `formAction` uendret.
- Fjern manuell `disabled={pending}`-logikk hvis filen hadde sin egen
  `useFormStatus`-wrapper — `SubmitButton` overtar.

### B) `onClick` + `useTransition`/`useState`-knapp → `Button pending`

Før:
```tsx
const [isPending, startTransition] = useTransition();
// ...
<Button onClick={handleApprove} disabled={isPending}>Godkjenn</Button>
```
Etter:
```tsx
const [isPending, startTransition] = useTransition();
// ...
<Button onClick={handleApprove} pending={isPending} pendingLabel="Godkjenner …">
  Godkjenn
</Button>
```
- `pending` setter disabled selv — fjern separat `disabled={isPending}` (men
  behold `disabled={andreVilkår || isPending}` hvis det fantes annen disabled-logikk;
  skriv `disabled={andreVilkår}` og la `pending` styre resten).
- Hvis knappen ikke hadde `useTransition` ennå men gjorde en bar `async onClick`,
  legg til `const [isPending, startTransition] = useTransition()` og wrap kallet i
  `startTransition(() => action())`.

### Pending-label-tabell (presens, bruker-rettet norsk)

Form: `«Verb …»` (mellomrom + ellipsis). Ikke i tabellen → avled presens av samme verb.

| Idle | Pending |
|---|---|
| Lagre / Lagre endringer / Lagre rolle / Lagre vilkår / Lagre forklaring | Lagrer … |
| Lever kort | Leverer … |
| Send meg kode / Send / Send på nytt | Sender … |
| Logg inn | Logger inn … |
| Send invitasjon / Inviter | Inviterer … |
| Opprett klubb / bane / spill | Oppretter … |
| Start spillet / Start cupen | Starter … |
| Avslutt spillet / Avslutt cupen | Avslutter … |
| Gjenåpne spillet / kortet | Gjenåpner … |
| Gjenåpne (tee) | Gjenåpner … |
| Godkjenn | Godkjenner … |
| Avvis / Avvis påmelding | Avviser … |
| Be om å bli med | Sender forespørsel … |
| Meld meg på | Melder deg på … |
| Send forespørsel | Sender … |
| Slett (kontoen min / spillet / banen / cupen / spilleren) | Sletter … |
| Trekk tilbake / Trekk fra | Trekker tilbake … |
| Fjern medlem | Fjerner … |
| Forlat klubben | Forlater … |
| Generer / Opprett matcher | Genererer … |
| Marker alle som lest | Markerer … |

### Gate per fil (kjør FØR commit av den filen)

```bash
npx vitest run <co-located test hvis den finnes> && npx tsc --noEmit
```
- Hvis filen har en co-lokert `*.test.tsx`, kjør den. Hvis ikke, kjør minst `tsc`.
- `tsc --noEmit` MÅ være grønn (per feedback_tsc_gate_preexisting_trap — nye
  prop-typer må stemme overalt).
- Endrer du bruker-rettet pending-tekst: kjør `humanizer`-skillet på de nye
  strengene (de er korte presens-verb; normalt rene, men sjekk).

### Commit per fil

```bash
git add <fil>
git commit -m "refactor(ui): #446 wire <kort beskrivelse> to laster-tilstand

Refs #446"
```
Prefix er `refactor(...)` — den bruker-synlige featuren + CHANGELOG shipper i
Task 1. Hooken slipper `refactor` fritt (ingen bump-krav).

---

## Task 1: Fundament — Spinner, Button.pending, SubmitButton, tester, bump

**Files:**
- Create: `components/ui/Spinner.tsx`
- Modify: `components/ui/Button.tsx`
- Create: `components/ui/SubmitButton.tsx`
- Create: `components/ui/Button.test.tsx`
- Create: `components/ui/SubmitButton.test.tsx`
- Modify: `app/(auth)/login/_components/SendCodeForm.tsx` (bruk delt Spinner)
- Modify: `package.json`, `CHANGELOG.md`

- [ ] **Step 1: Lag delt Spinner**

`components/ui/Spinner.tsx`:
```tsx
/**
 * Liten laster-spinner. Arver tekstfargen (border-current) så den passer i
 * alle Button-varianter. animate-spin er ikke dempet av prefers-reduced-motion
 * i globals.css (kun navngitte dekor-klasser er det), så den beveger seg også
 * under «Reduser bevegelse».
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Laster"
      role="status"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current ${className}`}
    />
  );
}
```

- [ ] **Step 2: Skriv Button-test (feilende)**

`components/ui/Button.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button pending-tilstand', () => {
  it('viser children og er ikke disabled når ikke pending', () => {
    render(<Button>Lagre</Button>);
    const btn = screen.getByRole('button', { name: 'Lagre' });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('er disabled, viser pendingLabel og en spinner når pending', () => {
    render(<Button pending pendingLabel="Lagrer …">Lagre</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveTextContent('Lagrer …');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Kjør testen, verifiser at den feiler**

Run: `npx vitest run components/ui/Button.test.tsx`
Expected: FAIL (Button godtar ikke `pending`/`pendingLabel` ennå; ingen `role="status"`).

- [ ] **Step 4: Utvid Button med `pending` + `pendingLabel`**

`components/ui/Button.tsx` — behold `BASE_CLASSES`, `VARIANTS`, `LinkButton` uendret. Bytt `Button`-funksjonen til:
```tsx
import { ButtonHTMLAttributes, type ReactNode } from 'react';
import { type LinkProps } from 'next/link';
import { SmartLink } from './SmartLink';
import { Spinner } from './Spinner';

// ... type Variant, BASE_CLASSES, VARIANTS uendret ...

export function Button({
  variant = 'primary',
  className = '',
  pending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
  pendingLabel?: ReactNode;
}) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${BASE_CLASSES} ${VARIANTS[variant]} ${className}`}
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Spinner />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
```

- [ ] **Step 5: Kjør Button-testen, verifiser grønt**

Run: `npx vitest run components/ui/Button.test.tsx`
Expected: PASS (begge cases).

- [ ] **Step 6: Skriv SubmitButton-test (feilende)**

`components/ui/SubmitButton.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// useFormStatus er bare meningsfull under form-submit; mock den så vi kan
// styre pending-tilstanden direkte.
const useFormStatus = vi.fn();
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>();
  return { ...actual, useFormStatus: () => useFormStatus() };
});

import { SubmitButton } from './SubmitButton';

describe('SubmitButton', () => {
  beforeEach(() => useFormStatus.mockReset());

  it('viser children når form ikke er pending', () => {
    useFormStatus.mockReturnValue({ pending: false });
    render(<SubmitButton pendingLabel="Sender …">Send</SubmitButton>);
    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('type', 'submit');
  });

  it('er disabled og viser pendingLabel + spinner når form er pending', () => {
    useFormStatus.mockReturnValue({ pending: true });
    render(<SubmitButton pendingLabel="Sender …">Send</SubmitButton>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Sender …');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Kjør testen, verifiser at den feiler**

Run: `npx vitest run components/ui/SubmitButton.test.tsx`
Expected: FAIL (`SubmitButton` finnes ikke).

- [ ] **Step 8: Lag SubmitButton**

`components/ui/SubmitButton.tsx`:
```tsx
'use client';

import { type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';

/**
 * Submit-knapp for <form action={…}>-flyter. Leser form-context (useFormStatus)
 * og mater Button.pending, så knappen bytter til pendingLabel + spinner og blir
 * disabled mens server-action-en kjører. Må rendres inni <form>.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} pending={pending} pendingLabel={pendingLabel}>
      {children}
    </Button>
  );
}
```

- [ ] **Step 9: Kjør SubmitButton-testen, verifiser grønt**

Run: `npx vitest run components/ui/SubmitButton.test.tsx`
Expected: PASS (begge cases).

- [ ] **Step 10: Bruk delt Spinner i SendCodeForm (fjern duplikat)**

I `app/(auth)/login/_components/SendCodeForm.tsx`: slett den lokale `function Spinner() {…}` (nederst), og importer den delte: `import { Spinner } from '@/components/ui/Spinner';`. Bruksstedet (`<Spinner />` i pending-blokken) er uendret.

- [ ] **Step 11: Bump versjon + CHANGELOG**

`package.json`: `"version": "1.82.0"` → `"1.82.1"`.

I `CHANGELOG.md`, under den åpne `## 1.82.y — Cup-start-varsel`-serien (øverst, over forrige `### [1.82.0]`-oppføring), legg til:
```markdown
### [1.82.1] - 2026-06-06 · #446

> Trykker du en knapp som lagrer, sender eller avslutter, sier den nå tydelig ifra at den jobber — teksten bytter til «Lagrer …», «Sender …» og lignende, og knappen låses så du ikke trykker to ganger ved et uhell.

<details>
<summary>Teknisk</summary>

#### Added
- `components/ui/Spinner.tsx` — delt laster-spinner (arver tekstfarge via `border-current`).
- `Button`-prop `pending` + `pendingLabel` — disabled + spinner + presens-tekst.
- `components/ui/SubmitButton.tsx` — `useFormStatus`-bro for `<form action>`-flyter.

#### Changed
- Server-action-knapper app-wide bytter til en ensartet laster-tilstand (presens-tekst + spinner, disabled) mens handlingen kjører. Dekker lagring, levering, opprettelse, godkjenning, avslutning m.m. på tvers av spiller- og admin-flatene.
- `SendCodeForm` bruker den delte `Spinner` i stedet for en lokal kopi.

</details>
```
Kjør `humanizer`-skillet på tagline-blockquote-en før du committer.

- [ ] **Step 12: Full gate**

Run: `npx vitest run components/ui/ && npx tsc --noEmit`
Expected: PASS, ingen type-feil.

- [ ] **Step 13: Commit (feat — bærer bump + CHANGELOG)**

```bash
git add components/ui/Spinner.tsx components/ui/Button.tsx components/ui/SubmitButton.tsx \
        components/ui/Button.test.tsx components/ui/SubmitButton.test.tsx \
        app/(auth)/login/_components/SendCodeForm.tsx package.json CHANGELOG.md
git commit -m "feat(ui): #446 laster-tilstand-primitiver + app-wide rollout start

SubmitButton + Button.pending/pendingLabel + delt Spinner. Bærer PATCH-bump
og CHANGELOG for hele #446-rulleringen; per-område-wiring følger som refactor.

Refs #446"
```

---

## Sweep-tasks (Task 2–11)

Hver task gjelder ett område. Dispatch én subagent per task (sonnet — mekanisk
arbeid mot ferdig recipe), som for HVER fil: bruker Conversion Recipe (A eller B),
henter pending-label fra tabellen, kjører gate, og committer atomisk per fil med
`refactor(ui): #446 …`. Subagenten skal **grep-verifisere** den faktiske listen i
sin path (`grep -rn "type=\"submit\"\|useTransition\|<Button" <path>`) — lista under
er utgangspunkt fra inventeringen, ikke garantert komplett.

Subagent-prompt-mal (fyll inn område + filer):
> Issue #446: gi server-action-knapper laster-tilstand i `<path>`. Følg Conversion
> Recipe i `docs/plans/2026-06-06-laster-tilstand-app-wide-implementation.md`
> (seksjon «Conversion Recipe»). For hver fil under: avgjør A (form→`SubmitButton`)
> eller B (`useTransition`→`Button pending`), hent pending-label fra tabellen, kjør
> `npx tsc --noEmit` + co-lokert test, commit atomisk per fil med prefix
> `refactor(ui): #446 …` og `Refs #446` i body. Ikke rør optimistisk tilstand som
> allerede finnes. Ikke legg til nye tester. Grep-verifiser lista først.

### Task 2: `app/admin/games/**` — spill-handlinger
- [ ] Konverter (Recipe A der ikke annet er nevnt):
  - `app/admin/games/[id]/StartGameButton.tsx` (Start spillet → Starter …)
  - `app/admin/games/[id]/EndGameButton.tsx` (Avslutt spillet → Avslutter …)
  - `app/admin/games/[id]/ReopenGameButton.tsx` (Gjenåpne → Gjenåpner …)
  - `app/admin/games/[id]/ReopenScorecardButton.tsx` (Gjenåpne kortet → Gjenåpner …)
  - `app/admin/games/[id]/ApprovePlayerButton.tsx` (Godkjenn … → Godkjenner …)
  - `app/admin/games/[id]/status/RemindButton.tsx` (Send påminnelse → Sender …)
  - `app/admin/games/[id]/avslutt/SideWinnersForm.tsx` (Lagre resultater → Lagrer …)
  - `app/admin/games/[id]/slett/page.tsx` (Slett spillet → Sletter …)
  - `app/admin/games/[id]/trekk-spiller/[userId]/page.tsx` (Trekk → Trekker tilbake …)
  - `app/admin/games/[id]/InviteToGameClient.tsx` (Recipe B — Inviter → Inviterer …)
- [ ] Gate + atomic commit per fil.

### Task 3: `app/admin/games/[id]/signups/PåmeldingerClient.tsx` (Recipe B)
- [ ] Godkjenn-knapp → `pending` + «Godkjenner …»; Avvis → «Avviser …»; RejectModal-submit → «Avviser …». Behold eksisterende optimistisk `pendingIds`-logikk; legg `pending`/`pendingLabel` på selve knappene.
- [ ] Gate + commit.

### Task 4: `app/admin/cup/**`
- [ ] `app/admin/cup/[id]/page.tsx` (Start cupen → Starter …; Avslutt cupen → Avslutter …)
  - `app/admin/cup/[id]/generer/GenerateMatchesWizard.tsx` (Recipe B — Opprett matcher → Genererer …)
  - `app/admin/cup/[id]/slett/page.tsx` (Slett cupen → Sletter …)
- [ ] Gate + commit per fil.

### Task 5: `app/admin/courses/**`
- [ ] `app/admin/courses/new/page.tsx` (Opprett bane → Oppretter …)
  - `app/admin/courses/[id]/edit/page.tsx` (Lagre → Lagrer …)
  - `app/admin/courses/[id]/edit/ArchivedTeesSection.tsx` (Gjenåpne → Gjenåpner …)
  - `app/admin/courses/[id]/slett/page.tsx` (Slett banen → Sletter …)
- [ ] Gate + commit per fil.

### Task 6: `app/admin/spillere/**` + `app/admin/klubber/**`
- [ ] `app/admin/spillere/_components/InviteForm.tsx` (Send invitasjon → Inviterer …)
  - `app/admin/spillere/_components/PendingInvitations.tsx` (Send på nytt → Sender …)
  - `app/admin/spillere/[id]/page.tsx` (Lagre → Lagrer …)
  - `app/admin/spillere/[id]/slett/page.tsx` (Slett spilleren → Sletter …)
  - `app/admin/spillere/invitations/[id]/trekk-tilbake/page.tsx` (Trekk tilbake → Trekker tilbake …)
  - `app/admin/klubber/ny/page.tsx` (Opprett klubb → Oppretter …)
  - `app/admin/klubber/[id]/page.tsx` (Lagre vilkår → Lagrer …)
- [ ] Gate + commit per fil.

### Task 7: `app/admin/formats/FormatsManager.tsx`
- [ ] Kun «Lagre forklaring»-submit-knappen → Recipe A («Lagrer …»). IKKE rør
  `useOptimistic`-checkbox-togglene (de har egen optimistisk tilstand).
- [ ] Gate + commit.

### Task 8: `app/klubber/**`
- [ ] `app/klubber/bli-med/[shortId]/page.tsx` (Be om å bli med → Sender forespørsel …)
  - `app/klubber/[id]/page.tsx` (godkjenn/avslå-forms → Godkjenner …/Avviser …; legg-til-medlem → ? avled presens; kjør grep for eksakt tekst)
  - `app/klubber/[id]/rolle/[userId]/page.tsx` (Lagre rolle → Lagrer …)
  - `app/klubber/[id]/fjern/[userId]/page.tsx` (Fjern medlem → Fjerner …)
  - `app/klubber/[id]/forlat/page.tsx` (Forlat klubben → Forlater …)
- [ ] Gate + commit per fil.

### Task 9: `app/games/[id]/**` — spiller-flyt
- [ ] `app/games/[id]/submit/SubmitForm.tsx` (Lever kort → Leverer …)
  - `app/games/[id]/approve/ReviewActions.tsx` (godkjenn/avvis kort → Godkjenner …/Avviser …)
  - `app/games/[id]/holes/[holeNumber]/PatsomeTeeStarterBanner.tsx` (Recipe B — har `disabled={isPending}` i dag; legg på `pending`+`pendingLabel`. Knappe-tekst = spillernavn → bruk pendingLabel «Velger …»)
  - `app/games/[id]/holes/[holeNumber]/FoursomesTeeStarterBanner.tsx` (samme som over)
  - `app/games/[id]/slett/page.tsx` (Slett spillet → Sletter …)
  - `app/games/[id]/avslutt/page.tsx` (hvis den finnes — spiller-avslutt/trekk-form; grep for knapp → avled presens)
  - `app/games/[id]/trekk-fra/page.tsx` (Trekk fra → Trekker tilbake …)
  - `app/games/[id]/spillere/CreatorRosterClient.tsx` (grep: roster-handlinger → avled presens)
- [ ] Gate + commit per fil.

### Task 10: `app/signup/**`
- [ ] `app/signup/[shortId]/RegistrationForm.tsx` (Recipe B — har allerede `isPending`-tekstbytte; migrer til `Button pending`+`pendingLabel` «Melder deg på …»/«Sender forespørsel …» for konsistens)
  - `app/signup/[shortId]/TeamRegistrationForm.tsx` (samme mønster)
  - `app/signup/[shortId]/team/TeamDashboardClient.tsx` (grep: action-knapper → avled presens)
- [ ] Gate + commit per fil.

### Task 11: `app/innboks/**`, `app/page.tsx`, `app/complete-profile`, `app/profile/**` + dedupe
- [ ] `app/innboks/InboxClient.tsx` (Recipe B — Marker alle som lest → Markerer …)
  - `app/innboks/MonthlyDigestToggle.tsx` (Recipe B — toggle; behold optimistisk setOptIn, men `disabled`/`pending` på selve switch-en mens in-flight om mulig; hvis switch ikke er en Button, hopp over — noter i commit)
  - `app/page.tsx` (handicap-chip-form → Lagrer …; grep for eksakt knapp)
  - `app/complete-profile/page.tsx` (Lagre → Lagrer …)
  - `app/profile/slett-konto/page.tsx` (Slett kontoen min → Sletter …)
  - `app/profile/ProfileFormBody.tsx` + `app/profile/InviteFriendForm.tsx` (har lokal `useFormStatus`-wrapper i dag — migrer til delt `SubmitButton` med `pendingLabel`)
  - `app/profile/venner/VennerClient.tsx` (dedupe — erstatt lokal `PendingButton`/`SubmitButton`/`ConfirmSubmit` sine submit-knapper med delt `SubmitButton`; behold `ConfirmSubmit`-to-tap-wrapperen men la dens indre submit bruke delt primitiv)
- [ ] Gate + commit per fil.

---

## Final verification (etter alle sweep-tasks)

- [ ] `npx vitest run` (hele suiten grønn).
- [ ] `npx tsc --noEmit` (ingen type-feil).
- [ ] `npm run build` (per feedback_tsc_gate_preexisting_trap — fanger exhaustive-switch / Vercel-build-feil som `tsc` alene kan bomme på).
- [ ] Grep-sjekk for gjenglemte sites: `grep -rn 'type="submit"' app | grep -i button` — verifiser at gjenværende treff er bevisste (f.eks. rene navigasjons-knapper) eller konvertert.
- [ ] Spot-sjekk i preview: én form-knapp (lever kort) + én transition-knapp (godkjenn påmelding) viser presens-tekst + spinner + disabled mens in-flight.
```
