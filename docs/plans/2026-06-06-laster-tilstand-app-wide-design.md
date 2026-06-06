# Laster-tilstand på server-action-knapper (app-wide) — design

**Issue:** [#446](https://github.com/jdlarssen/golf-app/issues/446)
**Dato:** 2026-06-06
**Type:** UX-polish (PATCH)

## Problem

Knapper som utløser en server-action (lagre, sende, opprette, godkjenne, avslutte)
gir ingen visuell tilbakemelding mens handlingen kjører. På mobil med 1–2 s
server-render + nettverk føles knappen død, og brukeren kan i verste fall trykke
flere ganger og fyre handlingen to ganger. Det går igjen på ~50 knapper i appen.

Mønsteret finnes allerede løst spredt: `useFormStatus()`-baserte pending-tilstander
i login (`SendCodeForm`/`VerifyCodeForm`), profil og venner, men uten en delt
primitiv — så de fleste knapper mangler det.

## Mål

Én ensartet laster-tilstand på alle server-action-knapper: knappen blir stående,
**teksten bytter til presens** («Lagre» → «Lagrer …»), knappen blir disabled, og en
liten spinner ligger foran teksten. Tekst er hoved-signalet (som login), spinneren
gir subtil bevegelse på trege handlinger. Ingen layout-hopp.

## Ikke-mål (out of scope)

- Server-side idempotens / dobbel-submit-vern på datalaget. Disabled-mens-pending
  dekker UX-en; ekte idempotens er et eget tema hvis det noen gang trengs.
- Optimistisk UI utover det som allerede finnes (f.eks. `FormatsManager`s
  `useOptimistic` røres ikke — den har allerede sin egen tilstand).
- Full login-stil ombygging (sentrert «Gjør X …»-blokk som erstatter hele
  skjemaet). Vurdert og forkastet til fordel for ensartet tekst-bytte i knappen
  som funker likt på alle ~50 sites, også liste-knapper.
- Ingen nye E2E-tester. Eksisterende golden-path-e2e skal forbli grønne.

## Arkitektur — tre biter i `components/ui/`

Laster-visualen bor **ett sted** (i `Button`), og to mekanismer mater den:
`useFormStatus` for skjemaer, `pending`-prop for transition-knapper.

### 1. `Spinner.tsx` (ny)

Trekker ut den eksisterende inline-spinneren (i dag duplisert i `SendCodeForm`)
til én delt komponent.

```tsx
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

- `border-current` så spinneren arver knappens tekstfarge (funker i alle
  Button-varianter: primary/secondary/danger/ghost).
- `animate-spin` er **ikke** dempet av `prefers-reduced-motion` i `globals.css`
  (den demper bare navngitte dekor-klasser: `.reveal-up`, `.confetti-piece`,
  `.lb-row`, `.sk`). Spinneren beveger seg altså også under «Reduser bevegelse»,
  og disabled-dim er et ekstra alltid-på-signal uavhengig av bevegelse.

### 2. `Button.tsx` (utvidet)

Base-`Button` får to nye props:

```tsx
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;            // true → disabled + spinner + pendingLabel
  pendingLabel?: React.ReactNode; // presens-tekst vist mens pending
};
```

Oppførsel når `pending` er `true`:
- `disabled={disabled || pending}` (dobbel-submit-vern; base har allerede
  `disabled:opacity-50 disabled:cursor-not-allowed`).
- `aria-busy={pending || undefined}`.
- Innhold: `<Spinner /> {pendingLabel ?? children}`. Faller tilbake til `children`
  hvis ingen `pendingLabel` er gitt (defensivt — men alle konverteringer skal gi
  én).

`LinkButton` røres ikke (navigasjon, ikke server-action).

### 3. `SubmitButton.tsx` (ny)

Tynn `'use client'`-bro for `<form action={…}>`-flyter. Leser form-context og
sender `pending` videre til `Button`:

```tsx
'use client';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';

export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} pendingLabel={pendingLabel} {...props}>
      {children}
    </Button>
  );
}
```

**Constraint:** `useFormStatus()` virker kun for en komponent som rendres *inni*
`<form>` (etterkommer av form-elementet). `SubmitButton` er en klient-komponent,
så i sites der skjemaet ligger i en server-komponent er den den naturlige
klient-grensen. Verifiseres per site under sweepen.

## To mekanismer → primitiv-mapping

| Kategori | Trigger | ~antall | Konvertering |
|---|---|---|---|
| **A** | `<form action={serverAction}>` submit-knapp | ~45 | `<Button>` → `<SubmitButton pendingLabel="…">` |
| **B** | `onClick` + `useTransition` / `useState`-flagg | ~12 | `<Button pending={isPending} pendingLabel="…">` |

Kategori B-knapper har allerede (eller får) `isPending` fra `useTransition` — vi
mater bare `pending`-propen. Noen har i dag bare `disabled={isPending}` uten
tekst/spinner (`PatsomeTeeStarterBanner`, `FoursomesTeeStarterBanner`); de får
full behandling.

## Verb-tabell (idle → pending)

Presens-tekst er bruker-rettet norsk og kjøres gjennom `humanizer`-skillet før
commit. Form: `«Verb …»` med mellomrom + ellipsis (følger `VerifyCodeForm`s
«Logger inn …»). Subagenter bruker denne tabellen så pending-tekst er konsistent:

| Idle-label | Pending-label |
|---|---|
| Lagre / Lagre endringer | Lagrer … |
| Lever kort | Leverer … |
| Send meg kode | Sender … |
| Logg inn | Logger inn … |
| Send / Send invitasjon | Sender … / Inviterer … |
| Send på nytt | Sender … |
| Opprett klubb / bane / spill | Oppretter … |
| Start spillet / Start cupen | Starter … |
| Avslutt spillet / cupen | Avslutter … |
| Gjenåpne spillet / kortet | Gjenåpner … |
| Godkjenn | Godkjenner … |
| Avvis / Avvis påmelding | Avviser … |
| Be om å bli med | Sender forespørsel … |
| Meld meg på | Melder deg på … |
| Slett … | Sletter … |
| Trekk tilbake / trekk fra | Trekker tilbake … |
| Fjern medlem | Fjerner … |
| Forlat klubben | Forlater … |
| Generer / Opprett matcher | Genererer … |
| Marker alle som lest | Markerer … |
| Lagre rolle / vilkår / forklaring | Lagrer … |

Knapper som ikke står i tabellen: avled presens av samme verb, kjør `humanizer`.

## Utrulling

Substansiell multi-fil-endring → subagent-drevet (`subagent-driven-development`).
Per `feedback_subagent_batching_for_similar_tasks` er det OK å batche N like
TDD-/konverterings-tasks i én subagent med atomic commit per fil.

1. **Fundament-commit (først, blokkerende):** `Spinner` + `Button.pending` +
   `SubmitButton` + Type C-tester + versjons-bump (PATCH) + CHANGELOG-oppføring
   som dekker hele app-wide-rulleringen. `feat(ui): #446 …`.
2. **Per-område-sweep via subagenter**, atomic commit per fil, prefix
   `refactor(ui): #446 …` (den bruker-synlige featuren + CHANGELOG shipper i
   fundament-commit-en; samme bump-én-gang-mønster som format-PR-seriene):
   - `app/admin/games/**` (start/avslutt/gjenåpne/godkjenn/påminn/side-winners/slett/trekk/inviter)
   - `app/admin/cup/**` (start/avslutt/generer/slett)
   - `app/admin/courses/**` (ny/rediger/slett/gjenåpne-tee)
   - `app/admin/spillere/**` + `app/admin/klubber/**` (inviter/send-på-nytt/trekk/rediger/opprett)
   - `app/admin/formats/**` (lagre forklaring)
   - `app/klubber/**` (bli-med/godkjenn-avslå/rolle/fjern/forlat)
   - `app/games/[id]/**` spiller-flyt (lever kort, godkjenn kort, tee-startere, slett, trekk-fra)
   - `app/signup/**` (RegistrationForm, TeamRegistrationForm, TeamDashboardClient)
   - `app/profile/**` (slett-konto; profil/invite-friend har allerede pending — migrer til delt primitiv)
   - `app/innboks/**` (marker alle som lest, månedsbrev-toggle), `app/page.tsx`, `complete-profile`
3. **Dedupe:** erstatt den lokale `PendingButton`/`SubmitButton` i
   `app/profile/venner/VennerClient.tsx` med den delte `SubmitButton`.

Hver subagent får: berørte filer, verb-tabellen, `Refs #446` i hver commit,
instruks om å kjøre co-lokerte tester + `tsc --noEmit` på det de rører, og
`humanizer` på nye pending-tekster.

## Testing (test-disiplin, Type C)

- `Button.test.tsx`: `pending` → knappen er `disabled`, viser `pendingLabel`, og
  har en `role="status"`-spinner. Idle → viser `children`, ikke disabled. Én test
  (it.each for de to tilstandene).
- `SubmitButton.test.tsx`: mock `react-dom`s `useFormStatus`; pending=true →
  disabled + pendingLabel + spinner; pending=false → children. Én test.
- **Ingen** nye per-site-tester (mekaniske bytter — ville vært «mens jeg var
  her»-tester). Eksisterende tester på berørte filer skal forbli grønne.
- Gate per berørt fil: co-lokerte `*.test` + `tsc --noEmit` (per
  `feedback_run_colocated_tests_for_changed_files`).

## Versjonering

PATCH (`vX.Y.Z+1`) — design-polish, samme handlinger, bedre feedback. Bump +
CHANGELOG i fundament-commit-en; resten av sweepen er `refactor(...)` og passerer
commit-msg-hooken fritt.

## Filer

**Nye:** `components/ui/Spinner.tsx`, `components/ui/SubmitButton.tsx`,
`components/ui/Button.test.tsx`, `components/ui/SubmitButton.test.tsx`.
**Endret:** `components/ui/Button.tsx` + ~50 call-sites (se Utrulling),
`app/(auth)/login/_components/SendCodeForm.tsx` (bruk delt `Spinner`),
`app/profile/venner/VennerClient.tsx` (dedupe), `package.json`, `CHANGELOG.md`.
