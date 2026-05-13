# Admin-spillere Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bygg en samlet admin-flate (`/admin/spillere`) for invitasjons- og spilleradministrasjon med tre faser, hver pushet til main som atomic commit med MINOR version-bump.

**Architecture:** Én side med tre seksjoner (registrerte spillere, ventende invitasjoner, inviter ny). Detalj-side for redigering. Egen bekreftelses-side for sletting. Service-role Supabase-klient introduseres for `auth.admin.deleteUser`-kall.

**Tech Stack:** Next.js 16 App Router (server components + server actions), TypeScript, Supabase JS (cookie-klient + service-role-klient), Resend (eksisterende `sendInviteNotification`-helper), Tailwind + custom UI primitives i `components/ui/`.

**Design doc:** [`docs/plans/2026-05-13-admin-spillere-design.md`](2026-05-13-admin-spillere-design.md)

---

## Forutsetninger (sjekk før Phase 1 starter)

- `SUPABASE_SERVICE_ROLE_KEY` må eksistere som env-var i Vercel og lokalt. Sjekk Vercel Project Settings → Environment Variables. Hvis den mangler:
  - Hent fra Supabase Dashboard → Project Settings → API → `service_role secret`
  - Legg til i Vercel (Production, Preview, Development) som `SUPABASE_SERVICE_ROLE_KEY`
  - Legg til lokalt i `.env.local`
- Supabase MCP er tilgjengelig (project id `glofubopddkjhymcbaph`) — bruk `mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration` for migrasjon i Phase 2.

---

# Fase 1 — Hovedside `/admin/spillere`

**Mål:** Erstatte `/admin/invitations` med en bredere `/admin/spillere`-flate. Levere søkbar spillerliste, ventende invitasjoner med Send-på-nytt + Trekk-tilbake-handlinger, og en sammenfoldet inviter-ny-form.

**Versjon etter Fase 1:** `0.4.2 → 0.5.0`

### Task 1.1: Verifiser service-role env

**Files:** ingen filendring — kun verifikasjon.

**Step 1:** Sjekk lokalt:
```bash
grep -c "SUPABASE_SERVICE_ROLE_KEY" .env.local || echo "MANGLER"
```

**Step 2:** Hvis den mangler lokalt, instruer brukeren:
> «Gå til Supabase Dashboard → glofubopddkjhymcbaph → Project Settings → API → kopier `service_role secret`-verdien. Lim inn i `.env.local` som `SUPABASE_SERVICE_ROLE_KEY=...` og bekreft. Jeg lager filen klar.»

**Step 3:** Sjekk Vercel via `vercel env ls` eller be brukeren bekrefte i Vercel-dashboardet under Project Settings → Environment Variables.

**Expected:** Variable finnes både lokalt og i Vercel før du fortsetter.

---

### Task 1.2: Service-role Supabase-klient

**Files:**
- Create: `lib/supabase/admin.ts`

**Step 1:** Opprett filen med innhold:

```ts
import { createClient } from '@supabase/supabase-js';

// Service-role Supabase-klient. SKAL ALDRI importeres av client components
// eller fra noe som havner i client bundle. Brukes kun fra server actions
// for å kalle auth.admin.*-funksjoner som krever service-role-nøkkel
// (deleteUser, m.m.). Service-role bypasser RLS — vær forsiktig.
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

**Step 2:** Verifiser at TypeScript kompilerer:
```bash
npx tsc --noEmit
```
**Expected:** ingen feil.

---

### Task 1.3: Hovedside-shell `/admin/spillere/page.tsx`

**Files:**
- Create: `app/admin/spillere/page.tsx`

**Step 1:** Opprett siden med shell + tre Suspense-grenser. Følg AdminShell-pattern fra `app/admin/invitations/page.tsx`:

```tsx
import { Suspense, cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { PlayersList } from './_components/PlayersList';
import { PendingInvitations } from './_components/PendingInvitations';
import { InviteForm } from './_components/InviteForm';

type SearchParams = Promise<{
  status?: string | string[];
  email?: string | string[];
  error?: string | string[];
  q?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Du må fylle inn en e-postadresse.',
  rate_limited: 'Vent litt før du sender en ny invitasjon.',
  log_failed: 'Invitasjonen ble sendt, men loggføring feilet.',
  mail_failed: 'Mailen kom ikke ut. Sjekk Vercel-loggene for detaljer.',
  resend_failed: 'Klarte ikke sende invitasjonen på nytt. Prøv igjen.',
  withdraw_failed: 'Klarte ikke trekke tilbake invitasjonen. Prøv igjen.',
  not_admin: 'Du har ikke tilgang til denne handlingen.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

const SUCCESS_MESSAGES: Record<string, string> = {
  sent: (email: string) => `✓ Invitasjon sendt til ${email}.`,
  resent: (email: string) => `✓ Invitasjon sendt på nytt til ${email}.`,
  withdrawn: (email: string) =>
    `Invitasjonen til ${email} er trukket tilbake. E-posten er ledig igjen.`,
} as unknown as Record<string, (email: string) => string>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const getCounts = cache(async () => {
  const supabase = await getServerClient();
  const [usersRes, pendingRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null),
  ]);
  return {
    userCount: usersRes.count ?? 0,
    pendingCount: pendingRes.count ?? 0,
  };
});

export default async function SpillerePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const email = first(params.email) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const successBuilder = status ? SUCCESS_MESSAGES[status] : undefined;
  const successMessage =
    typeof successBuilder === 'function' ? successBuilder(email) : undefined;
  const searchQuery = first(params.q) ?? '';

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Spillere · klubblisten" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Spillere
        </h1>
        <Suspense fallback={<Skeleton className="h-3 w-64" />}>
          <CountsLine />
        </Suspense>
      </div>

      {(successMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {successMessage && <Banner tone="success">{successMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>Registrerte spillere</MiniRibbon>
        <Suspense fallback={<ListSkeleton rows={4} />}>
          <PlayersList searchQuery={searchQuery} />
        </Suspense>
      </section>

      <section className="mt-5">
        <MiniRibbon>Ventende invitasjoner</MiniRibbon>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <PendingInvitations />
        </Suspense>
      </section>

      <section className="mt-5">
        <InviteForm />
      </section>
    </AdminShell>
  );
}

async function CountsLine() {
  const { userCount, pendingCount } = await getCounts();
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {userCount} registrert
      {pendingCount > 0 && ` · ${pendingCount} venter`}
    </p>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 px-3.5 py-3"
          style={{
            borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
          }}
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-3/5" delay={i * 90} />
            <Skeleton className="mt-1 h-2.5 w-2/5" delay={i * 90 + 30} />
          </div>
          <Skeleton className="h-4 w-16 rounded-full" delay={i * 90 + 60} />
        </div>
      ))}
    </div>
  );
}
```

**Step 2:** Verifiser TS-kompilering (komponenter ennå ikke skrevet — feilen «module not found» er forventet i dette steget).

---

### Task 1.4: PlayersList-komponent

**Files:**
- Create: `app/admin/spillere/_components/PlayersList.tsx`

**Step 1:** Opprett komponenten. Server-component som henter alle brukere og filtrerer in-memory (lista er liten — for nå unngå vi DB-side ILIKE-trickery). Bruker URL-search-param `?q=...` som filter:

```tsx
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { Input } from '@/components/ui/Input';

type User = {
  id: string;
  name: string;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  created_at: string;
};

export async function PlayersList({ searchQuery }: { searchQuery: string }) {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at')
    .order('created_at', { ascending: false })
    .returns<User[]>();

  if (error) throw error;

  const users = data ?? [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.nickname?.toLowerCase() ?? '').includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    : users;

  return (
    <>
      <form method="GET" action="/admin/spillere" className="mb-2">
        <Input
          id="q"
          name="q"
          type="search"
          label=""
          placeholder="Søk på navn, kallenavn eller e-post..."
          defaultValue={searchQuery}
          autoComplete="off"
        />
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
          {q
            ? `Ingen treff på "${searchQuery}".`
            : 'Ingen registrerte spillere ennå.'}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          {filtered.map((u, i) => (
            <SmartLink
              key={u.id}
              href={`/admin/spillere/${u.id}`}
              className="reveal-up flex items-center justify-between gap-3 px-3.5 py-3 transition hover:bg-row-hover"
              style={{
                animationDelay: `${60 + i * 50}ms`,
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                  {u.name}
                  {u.nickname && (
                    <span className="ml-1.5 font-sans text-[11.5px] text-muted">
                      ({u.nickname})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate font-sans text-[11.5px] text-muted">
                  {u.email}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-sans text-[12px] tabular-nums text-text">
                  {u.hcp_index.toFixed(1)}
                </p>
                {u.is_admin && (
                  <p
                    className="mt-0.5 font-sans text-[9.5px] font-semibold uppercase"
                    style={{ letterSpacing: '0.16em', color: '#7a5410' }}
                  >
                    Admin
                  </p>
                )}
              </div>
            </SmartLink>
          ))}
        </div>
      )}
    </>
  );
}
```

**Step 2:** Bekreft TS-kompilering for denne filen.

---

### Task 1.5: PendingInvitations-komponent

**Files:**
- Create: `app/admin/spillere/_components/PendingInvitations.tsx`

**Step 1:** Opprett komponenten. Viser ventende invitasjoner (accepted_at IS NULL). Hver rad har Send-på-nytt + Trekk-tilbake-knappene (handlingene wires opp i Task 1.8):

```tsx
import { getServerClient } from '@/lib/supabase/server';
import { resendInvitation, withdrawInvitation } from '../actions';

type PendingInvitation = {
  id: string;
  email: string;
  created_at: string;
};

const MONTHS_NB = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

function shortNb(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]}`;
}

export async function PendingInvitations() {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, created_at')
    .is('accepted_at', null)
    .order('created_at', { ascending: false })
    .returns<PendingInvitation[]>();

  if (error) throw error;
  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
        Ingen ventende invitasjoner.
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-surface"
      style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
    >
      {items.map((inv, i) => (
        <PendingRow key={inv.id} inv={inv} index={i} />
      ))}
    </div>
  );
}

function PendingRow({
  inv,
  index,
}: {
  inv: PendingInvitation;
  index: number;
}) {
  return (
    <div
      className="reveal-up flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
      style={{
        animationDelay: `${60 + index * 50}ms`,
        borderTop: index === 0 ? 'none' : '1px solid var(--row-divider-warm)',
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
          {inv.email}
        </p>
        <p className="mt-0.5 font-sans text-[11.5px] tabular-nums text-muted">
          Sendt {shortNb(inv.created_at)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <form action={resendInvitation}>
          <input type="hidden" name="id" value={inv.id} />
          <button
            type="submit"
            className="rounded-full border border-border bg-surface px-3 py-1.5 font-sans text-[12px] font-medium text-text transition hover:bg-row-hover"
          >
            Send på nytt
          </button>
        </form>
        <WithdrawButton invitationId={inv.id} />
      </div>
    </div>
  );
}

function WithdrawButton({ invitationId }: { invitationId: string }) {
  return (
    <details className="relative">
      <summary
        className="cursor-pointer list-none rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium transition"
        style={{
          borderColor: 'rgba(180, 60, 60, 0.3)',
          color: '#a04040',
        }}
      >
        Trekk tilbake
      </summary>
      <div className="absolute right-0 z-10 mt-1 flex gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-md">
        <form action={withdrawInvitation}>
          <input type="hidden" name="id" value={invitationId} />
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 font-sans text-[12px] font-semibold text-white"
            style={{ background: '#a04040' }}
          >
            Bekreft
          </button>
        </form>
      </div>
    </details>
  );
}
```

Notat: `<details>`-elementet gir oss inline to-trinn uten ny JS-infra. Klikk åpner et lite pop-out med «Bekreft»-knapp; klikk utenfor lukker det.

---

### Task 1.6: InviteForm-komponent (sammenfoldet)

**Files:**
- Create: `app/admin/spillere/_components/InviteForm.tsx`

**Step 1:** Opprett komponenten. `<details>` brukes for fold-out:

```tsx
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { sendInvitation } from '../actions';

export function InviteForm() {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-center font-sans text-[13px] font-medium text-primary hover:underline">
        + Inviter ny spiller
      </summary>
      <div
        className="mt-3 rounded-xl border border-border bg-surface p-4"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <form action={sendInvitation} className="space-y-3">
          <Input
            id="email"
            name="email"
            type="email"
            label="E-postadresse"
            placeholder="spiller@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" className="w-full">
            Send invitasjon
          </Button>
        </form>
      </div>
    </details>
  );
}
```

---

### Task 1.7: Actions-fil med `sendInvitation` (flyttet) og `resendInvitation`

**Files:**
- Create: `app/admin/spillere/actions.ts`

**Step 1:** Lag fil med `sendInvitation` flyttet fra gamle `app/admin/invitations/actions.ts` + ny `resendInvitation`:

```ts
'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin, name, id')
    .eq('id', user.id)
    .single();
  if (error || !profile?.is_admin) redirect('/');
  return { supabase, profile };
}

export async function sendInvitation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/admin/spillere?error=email_required');

  const { supabase, profile } = await requireAdmin();
  const invitedByName = profile.name?.trim() || 'Admin';

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: profile.id,
    expires_at: expiresAt,
  });
  if (insertError) redirect('/admin/spillere?error=log_failed');

  try {
    await sendInviteNotification({ to: email, invitedByName });
  } catch (err) {
    console.error('[admin/spillere] notification mail failed', err);
    const qs = new URLSearchParams({ error: 'mail_failed', email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/admin/spillere?${qs.toString()}`);
}

export async function resendInvitation(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const { supabase, profile } = await requireAdmin();
  const invitedByName = profile.name?.trim() || 'Admin';

  const { data: inv, error } = await supabase
    .from('invitations')
    .select('email, accepted_at')
    .eq('id', id)
    .single();
  if (error || !inv) redirect('/admin/spillere?error=resend_failed');
  if (inv.accepted_at) redirect('/admin/spillere?error=resend_failed');

  try {
    await sendInviteNotification({ to: inv.email, invitedByName });
  } catch (err) {
    console.error('[admin/spillere] resend mail failed', err);
    const qs = new URLSearchParams({ error: 'mail_failed', email: inv.email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  const qs = new URLSearchParams({ status: 'resent', email: inv.email });
  redirect(`/admin/spillere?${qs.toString()}`);
}

export async function withdrawInvitation(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const { supabase } = await requireAdmin();

  const { data: inv, error: fetchError } = await supabase
    .from('invitations')
    .select('email, accepted_at')
    .eq('id', id)
    .single();
  if (fetchError || !inv) redirect('/admin/spillere?error=withdraw_failed');
  if (inv.accepted_at) redirect('/admin/spillere?error=withdraw_failed');

  // Slett invitations-raden via cookie-klienten (RLS lar admin gjøre det)
  const { error: delError } = await supabase
    .from('invitations')
    .delete()
    .eq('id', id);
  if (delError) {
    console.error('[admin/spillere] invitation delete failed', delError);
    redirect('/admin/spillere?error=withdraw_failed');
  }

  // Hvis invitéen hadde bedt om kode (auth.users-rad finnes) men ikke
  // fullført profil (ingen public.users-rad), rydd opp auth.users-raden
  // via service-role så e-posten frigjøres.
  try {
    const admin = getAdminClient();
    // Hent auth.users via service-role
    const { data: authList } = await admin.auth.admin.listUsers();
    const orphan = authList?.users?.find(
      (u) => u.email?.toLowerCase() === inv.email.toLowerCase(),
    );
    if (orphan) {
      const { data: publicRow } = await admin
        .from('users')
        .select('id')
        .eq('id', orphan.id)
        .maybeSingle();
      if (!publicRow) {
        await admin.auth.admin.deleteUser(orphan.id);
      }
    }
  } catch (err) {
    // Ikke fatal — invitations-raden er allerede slettet. Logg og la
    // brukeren se en sukcess-banner siden hovedhandlingen lyktes.
    console.error('[admin/spillere] auth orphan cleanup failed', err);
  }

  const qs = new URLSearchParams({ status: 'withdrawn', email: inv.email });
  redirect(`/admin/spillere?${qs.toString()}`);
}
```

**Step 2:** Bekreft TS-kompilering: `npx tsc --noEmit`. Forventet: ingen feil.

---

### Task 1.8: Oppdater admin-hjemmesiden — bytt «Invitasjoner»-tile mot «Spillere»

**Files:**
- Modify: `app/admin/page.tsx`

**Step 1:** Finn `TilesGrid`-funksjonen og endre tile-arrayet:
- Bytt ut tile «Invitasjoner» med ny tile «Spillere» som peker til `/admin/spillere`.
- Meta-tekst teller registrerte spillere (`users`-table count) + ventende invitasjoner.
- Ikon: `KonvoluttIcon` byttes til en passende silhuett. **Sjekk hva som finnes i `components/icons/`** — hvis ingen passende ikon, behold KonvoluttIcon midlertidig (TODO: bytt ikon).

Konkret endring (innenfor `TilesGrid`):

```ts
// Erstatt det eksisterende pendingInvitesRes-callet:
const [
  activeGamesRes,
  plannedGamesRes,
  pendingInvitesRes,
  usersRes,
  coursesRes,
  lastFinishedRes,
] = await Promise.all([
  // ... behold de eksisterende ...
  supabase.from('users').select('id', { count: 'exact', head: true }),
  // ... resten ...
]);

const userCount = usersRes.count ?? 0;
const pendingInvites = pendingInvitesRes.count ?? 0;

// I tiles-arrayet, ERSTATT 'Invitasjoner'-objektet med:
{
  label: 'Spillere',
  href: '/admin/spillere',
  meta:
    userCount === 0
      ? 'Ingen registrerte ennå'
      : `${userCount} registrert${pendingInvites > 0 ? ` · ${pendingInvites} venter` : ''}`,
  icon: 'konvolutt', // TODO: bytt til passende silhuett-ikon når vi har et
},
```

**Step 2:** Bekreft side rendrer: `npm run dev` lokalt, gå til `/admin`, sjekk at «Spillere»-tilen vises med riktig meta.

---

### Task 1.9: Fjern gamle `/admin/invitations`-rute

**Files:**
- Delete: `app/admin/invitations/page.tsx`
- Delete: `app/admin/invitations/actions.ts`
- (Beholde mappen tom? Nei — slett hele mappen)

**Step 1:** Slett filene:
```bash
rm -rf app/admin/invitations
```

**Step 2:** Søk etter gjenværende referanser til den gamle ruten:
```bash
grep -rn "/admin/invitations" --include="*.tsx" --include="*.ts" app/ components/ lib/ 2>/dev/null
```

**Expected:** ingen treff. Hvis noen ligger igjen (f.eks. i mail-mal eller annen lenke): erstatt med `/admin/spillere`.

---

### Task 1.10: Lokalt build + manuell røyk-test

**Step 1:** Kjør build:
```bash
npm run build
```
**Expected:** PASS. Hvis TS-feil eller manglende moduler: fiks dem før neste steg.

**Step 2:** Start dev-server:
```bash
npm run dev
```
Naviger lokalt til `http://localhost:3000/admin/spillere`:
- Sjekk at de tre seksjonene rendrer (eller tomtilstander)
- Søk i spillerlista — bekreft at filtrering fungerer
- Ekspander «+ Inviter ny spiller» — bekreft form vises

---

### Task 1.11: Version bump + CHANGELOG + commit + push

**Files:**
- Modify: `package.json` (version: 0.4.2 → 0.5.0)
- Modify: `CHANGELOG.md`

**Step 1:** Bump versjon:
```bash
npm version minor --no-git-tag-version
```
**Expected:** `package.json` og `package-lock.json` oppdatert til `0.5.0`.

**Step 2:** Legg til CHANGELOG-entry øverst (etter `---` under introen):

```markdown
## [0.5.0] - 2026-05-13

### Added

- **Ny samlet spilleradministrasjon på `/admin/spillere`.** Erstatter gamle `/admin/invitations`. Tre seksjoner i én flate: registrerte spillere (med søk på navn/kallenavn/e-post), ventende invitasjoner, og en sammenfoldet «Inviter ny spiller»-form nederst.
- **«Send på nytt»-knapp på ventende invitasjoner.** Trigger ny notifikasjons-mail via Resend til samme adresse. Ingen ny DB-rad.
- **«Trekk tilbake»-knapp på ventende invitasjoner** med inline to-trinn-bekreft. Sletter `invitations`-raden; hvis invitéen hadde bedt om kode men aldri fullført profil (foreldreløs `auth.users`-rad), ryddes også den slik at e-posten er ledig igjen.

### Changed

- **Admin-hjemmeside-tile «Invitasjoner» erstattet av «Spillere»** med kombinert telling («12 registrert · 4 venter»).

### Removed

- **Rute `/admin/invitations`** — funksjonaliteten finnes nå på `/admin/spillere`.
```

**Step 3:** Verifiser at git-hook ikke blokkerer:
```bash
git add app/admin/spillere lib/supabase/admin.ts app/admin/page.tsx package.json package-lock.json CHANGELOG.md
git status
```
Sjekk at både `package.json` og `CHANGELOG.md` er staged.

**Step 4:** Slett gamle ruten (allerede gjort i Task 1.9, men stage slettingen):
```bash
git add -u app/admin/invitations
```

**Step 5:** Commit:
```bash
git commit -m "$(cat <<'EOF'
feat(admin/spillere): samlet flate for invitasjoner og spillere

Erstatter /admin/invitations med /admin/spillere som har tre seksjoner:
registrerte spillere (med søk), ventende invitasjoner (med Send-på-nytt
og Trekk-tilbake-handlinger), og en sammenfoldet inviter-ny-form.

Trekk-tilbake-handlingen rydder opp foreldreløse auth.users-rader via
ny service-role-klient i lib/supabase/admin.ts, så feilstavet e-post
kan re-inviteres etter at den er trukket tilbake.

Admin-home-tile «Invitasjoner» byttet til «Spillere» med kombinert
telling.
EOF
)"
```

**Step 6:** Push til main:
```bash
git push origin claude/focused-shaw-89f559
```

Hvis du er på `main`-branchen direkte, push direkte. Hvis worktree-branch: opprett PR eller merge til main først per CLAUDE.md.

**Step 7:** Verifiser Vercel-deploy lykkes (sjekk Vercel dashboard eller `vercel ls`).

---

# Fase 2 — Bruker-detalj `/admin/spillere/[id]` med redigering

**Mål:** Klikkbare rader i spillerlista går til detalj-side hvor admin kan endre navn, kallenavn og handicap. Faresone-seksjon er forberedt men slett-lenken er disabled (Fase 3 aktiverer den).

**Versjon etter Fase 2:** `0.5.0 → 0.6.0`

### Task 2.1: Migrasjon `0014_admin_user_management.sql`

**Files:**
- Create: `supabase/migrations/0014_admin_user_management.sql`

**Step 1:** Opprett migrasjon:

```sql
-- Admin kan oppdatere alle bruker-rader. I dag har vi kun
-- "users update own" (egen rad), som blokkerer admin-form-endring av
-- andre brukere. Denne policyen lar admin oppdatere hvem som helst.
create policy "users admin update" on public.users
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- Admin kan slette bruker-rader. Selve slettingen vil i praksis gå
-- via auth.admin.deleteUser (service-role) som cascade-sletter
-- public.users automatisk, men vi legger policyen på plass for å
-- være eksplisitte om hvem som har myndighet til å slette i denne
-- tabellen.
create policy "users admin delete" on public.users
  for delete using (public.is_admin());
```

**Step 2:** Anvend migrasjon via Supabase MCP:

```
Tool: mcp__36be25a6-2d72-41c3-a675-2352133ed510__apply_migration
project_id: glofubopddkjhymcbaph
name: admin_user_management
query: (innholdet over)
```

**Step 3:** Verifiser at policyen finnes:

```
Tool: mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql
project_id: glofubopddkjhymcbaph
query: select policyname from pg_policies where tablename = 'users';
```
**Expected:** Liste inkluderer `users admin update` og `users admin delete`.

---

### Task 2.2: Detalj-side `app/admin/spillere/[id]/page.tsx`

**Files:**
- Create: `app/admin/spillere/[id]/page.tsx`

**Step 1:** Opprett siden med form og faresone:

```tsx
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { updateUser } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  status?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Navn må fylles ut.',
  hcp_out_of_range: 'Handicap må være mellom 0 og 54.',
  update_failed: 'Klarte ikke lagre endringene.',
  not_admin: 'Du har ikke tilgang.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const MONTHS_NB = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];
function shortNb(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const status = first(sp.status);
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const adminUserId = await getProxyVerifiedUserId();

  const { data: target, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!target) notFound();

  // Tell game_players-rader for blokk-betingelse på slett-lenke
  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);

  const isSelf = target.id === adminUserId;
  const hasPlayed = (gamePlayerCount ?? 0) > 0;
  const canDelete = !isSelf && !hasPlayed;

  let deleteBlockReason: string | null = null;
  if (isSelf) deleteBlockReason = 'Du kan ikke slette din egen konto.';
  else if (hasPlayed) {
    deleteBlockReason = `${target.name.split(' ')[0]} har spilt ${gamePlayerCount} ${gamePlayerCount === 1 ? 'runde' : 'runder'}. Slett spillene først hvis du vil fjerne kontoen.`;
  }

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin/spillere">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Spillerprofil" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {target.name}
        </h1>
        {target.nickname && (
          <p className="font-serif text-[14px] italic text-muted">
            ({target.nickname})
          </p>
        )}
        <p className="mt-1 font-sans text-[11.5px] tabular-nums text-muted">
          {target.email} · Registrert {shortNb(target.created_at)}
          {target.is_admin && ' · Super-admin'}
        </p>
      </div>

      {(status === 'updated' || errorMessage) && (
        <div className="mt-4 space-y-2">
          {status === 'updated' && (
            <Banner tone="success">Endringene er lagret.</Banner>
          )}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <div
          className="rounded-xl border border-border bg-surface p-4"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          <form action={updateUser} className="space-y-3">
            <input type="hidden" name="id" value={target.id} />
            <Input
              id="name"
              name="name"
              label="Navn"
              defaultValue={target.name}
              required
            />
            <Input
              id="nickname"
              name="nickname"
              label="Kallenavn"
              defaultValue={target.nickname ?? ''}
              placeholder="Valgfritt"
            />
            <Input
              id="hcp_index"
              name="hcp_index"
              type="number"
              step="0.1"
              min="0"
              max="54"
              label="Handicap-indeks"
              defaultValue={target.hcp_index.toString()}
              required
            />
            <Button type="submit" className="w-full">
              Lagre endringer
            </Button>
          </form>
        </div>
      </section>

      <section className="mt-6">
        <p className="mb-1.5 px-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Faresone
        </p>
        <div
          className="rounded-xl border bg-surface px-4 py-3.5"
          style={{
            borderColor: 'rgba(180, 60, 60, 0.18)',
            boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)',
          }}
        >
          {canDelete ? (
            <div className="text-center">
              {/* Fase 3 aktiverer denne lenken. Inntil da: disabled-state. */}
              <span
                className="font-sans text-[13px] font-medium text-muted"
                aria-disabled="true"
              >
                Slett spilleren (aktiveres i neste runde)
              </span>
            </div>
          ) : (
            <p className="text-center font-sans text-[12.5px] text-muted">
              {deleteBlockReason}
            </p>
          )}
        </div>
      </section>
    </AdminShell>
  );
}
```

**Notat:** I Fase 2 er slett-lenken disabled (kommentar i koden). Fase 3 erstatter `<span>` med en `<SmartLink>` til `/slett`-siden.

---

### Task 2.3: `updateUser`-server-action

**Files:**
- Create: `app/admin/spillere/[id]/actions.ts`

**Step 1:**

```ts
'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (error || !profile?.is_admin) redirect('/');
  return supabase;
}

export async function updateUser(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const nickname = String(formData.get('nickname') ?? '').trim();
  const hcpRaw = String(formData.get('hcp_index') ?? '').trim();

  if (!id) redirect('/admin/spillere?error=unknown');
  if (!name) redirect(`/admin/spillere/${id}?error=name_required`);

  const hcp = parseFloat(hcpRaw);
  if (Number.isNaN(hcp) || hcp < 0 || hcp > 54) {
    redirect(`/admin/spillere/${id}?error=hcp_out_of_range`);
  }

  const supabase = await requireAdmin();

  const { error } = await supabase
    .from('users')
    .update({
      name,
      nickname: nickname || null,
      hcp_index: hcp,
    })
    .eq('id', id);

  if (error) {
    console.error('[admin/spillere] updateUser failed', error);
    redirect(`/admin/spillere/${id}?error=update_failed`);
  }

  redirect(`/admin/spillere/${id}?status=updated`);
}
```

---

### Task 2.4: Build + manuell test

**Step 1:** `npm run build` → forventet PASS.

**Step 2:** `npm run dev` lokalt:
- Naviger til `/admin/spillere`, klikk på en spiller-rad.
- Bekreft detalj-side rendrer med riktige data.
- Endre kallenavn, lagre.
- Bekreft success-banner og at endringen stikker etter refresh.
- Naviger til DIN EGEN detalj-side — bekreft at faresonen viser «Du kan ikke slette din egen konto.»
- Hvis du har en spiller som har spilt: bekreft faresonen viser «X har spilt N runder...»

---

### Task 2.5: Version bump + CHANGELOG + commit + push

**Step 1:**
```bash
npm version minor --no-git-tag-version
```
**Expected:** `0.5.0 → 0.6.0`.

**Step 2:** Legg til CHANGELOG-entry:

```markdown
## [0.6.0] - 2026-05-13

### Added

- **Bruker-detalj på `/admin/spillere/[id]`.** Klikkbar rad i spillerlista åpner form for å redigere navn, kallenavn og handicap-indeks. Lagre-knapp gir ærlig success/feil-banner.
- **Faresone-seksjon** på detalj-siden viser slett-lenken som disabled inntil neste leveranse aktiverer den. Forklarende tekst hvis spilleren har historikk eller hvis det er deg selv.

### Changed

- **RLS:** Ny policy `users admin update` lar admin oppdatere andre bruker-rader (tidligere kun egen rad).
```

**Step 3:** Stage og commit:
```bash
git add app/admin/spillere supabase/migrations/0014_admin_user_management.sql package.json package-lock.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
feat(admin/spillere): rediger navn, kallenavn og handicap fra detalj-side

Ny rute /admin/spillere/[id] som åpnes når admin klikker en spiller-rad i
listevisningen. Form med tre felter (Navn, Kallenavn, Handicap-indeks) og
banner-feedback.

Ny RLS-policy "users admin update" på public.users lar admin oppdatere
hvem som helst (tidligere kun egen rad).

Faresone-seksjon nederst på detalj-siden er forberedt med disabled-state
for slett-lenken. Neste fase aktiverer slett-flyten.
EOF
)"
```

**Step 4:** Push.

---

# Fase 3 — Slett-flyt

**Mål:** Aktiver slett-lenken i faresonen, opprett bekreftelses-side på `/admin/spillere/[id]/slett`, og implementer `deleteUser`-action som kaller `auth.admin.deleteUser` for å cascade-slette via service-role.

**Versjon etter Fase 3:** `0.6.0 → 0.7.0`

### Task 3.1: Bekreftelses-side `app/admin/spillere/[id]/slett/page.tsx`

**Files:**
- Create: `app/admin/spillere/[id]/slett/page.tsx`

**Step 1:**

```tsx
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { deleteUser } from './actions';

type Params = Promise<{ id: string }>;

export default async function DeletePlayerPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;
  const supabase = await getServerClient();
  const adminUserId = await getProxyVerifiedUserId();

  const { data: target } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', id)
    .maybeSingle();
  if (!target) notFound();

  // Block-betingelser: må re-sjekkes her, ikke bare på detaljsiden.
  if (target.id === adminUserId) {
    redirect(`/admin/spillere/${id}?error=self_delete_forbidden`);
  }

  const { count: gamePlayerCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);

  if ((gamePlayerCount ?? 0) > 0) {
    redirect(`/admin/spillere/${id}?error=still_has_games`);
  }

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href={`/admin/spillere/${id}`}>Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett {target.name}?
        </h1>
        <p className="font-sans text-[14px] leading-relaxed text-text">
          Kontoen og e-postadressen ({target.email}) frigjøres. {target.name.split(' ')[0]} har aldri spilt en runde, så ingen historikk forsvinner.
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteUser}>
          <input type="hidden" name="id" value={target.id} />
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#a04040', borderColor: '#a04040' }}
          >
            Bekreft sletting
          </Button>
        </form>
        <SmartLink
          href={`/admin/spillere/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AdminShell>
  );
}
```

---

### Task 3.2: `deleteUser`-server-action

**Files:**
- Create: `app/admin/spillere/[id]/slett/actions.ts`

**Step 1:**

```ts
'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

export async function deleteUser(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const supabase = await getServerClient();
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
  if (!actor) redirect('/login');

  const { data: actorProfile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', actor.id)
    .single();
  if (!actorProfile?.is_admin) redirect('/');

  // Self-protect
  if (id === actor.id) {
    redirect(`/admin/spillere/${id}?error=self_delete_forbidden`);
  }

  // Hent target for å få e-post til banner-tekst og navnet
  const { data: target } = await supabase
    .from('users')
    .select('id, name')
    .eq('id', id)
    .maybeSingle();
  if (!target) redirect('/admin/spillere?error=unknown');

  // Block hvis spilleren har spilt
  const { count: gpCount } = await supabase
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', id);
  if ((gpCount ?? 0) > 0) {
    redirect(`/admin/spillere/${id}?error=still_has_games`);
  }

  // Slett via service-role. auth.users → public.users cascades (FK i 0001).
  try {
    const admin = getAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  } catch (err) {
    console.error('[admin/spillere] deleteUser failed', err);
    redirect(`/admin/spillere/${id}?error=auth_delete_failed`);
  }

  const qs = new URLSearchParams({ status: 'deleted', name: target.name });
  redirect(`/admin/spillere?${qs.toString()}`);
}
```

---

### Task 3.3: Aktiver slett-lenken i faresonen + banner for slettet bruker

**Files:**
- Modify: `app/admin/spillere/[id]/page.tsx`
- Modify: `app/admin/spillere/page.tsx`

**Step 1:** I `app/admin/spillere/[id]/page.tsx`, erstatt den disabled-spans i faresonen:

```tsx
{canDelete ? (
  <div className="text-center">
    <SmartLink
      href={`/admin/spillere/${target.id}/slett`}
      className="font-sans text-[13px] font-medium"
      style={{ color: '#a04040' }}
    >
      Slett spilleren
    </SmartLink>
  </div>
) : (
  // ... (uendret)
)}
```

Husk å importere `SmartLink` øverst.

**Step 2:** I `app/admin/spillere/page.tsx`, utvid ERROR_MESSAGES og SUCCESS_MESSAGES:

```ts
const ERROR_MESSAGES: Record<string, string> = {
  // ... eksisterende ...
  self_delete_forbidden: 'Du kan ikke slette din egen konto.',
  still_has_games: 'Spilleren har spillhistorikk og kan ikke slettes.',
  auth_delete_failed: 'Klarte ikke slette kontoen. Prøv igjen.',
};

const SUCCESS_MESSAGES = {
  // ... eksisterende ...
  deleted: (name: string) => `${name} er slettet.`,
} as unknown as Record<string, (email: string) => string>;
```

Og sørg for at `?name=...`-search-param leses og brukes til banner-tekst:

```ts
const name = first(params.name) ?? '';
// I tillegg til email:
const successMessage =
  typeof successBuilder === 'function'
    ? successBuilder(email || name)
    : undefined;
```

---

### Task 3.4: Build + manuell test

**Step 1:** `npm run build` → PASS.

**Step 2:** Lokal røyk-test:
1. Forsøk å gå til `/admin/spillere/<din-egen-id>/slett` → bekreft redirect tilbake med self-delete-feilmelding.
2. Hvis du har en testbruker uten game_players: gå til detalj → klikk slett-lenken → bekreft bekreftelses-siden viser navnet → klikk «Bekreft sletting» → bekreft redirect til `/admin/spillere` med success-banner.
3. Hvis du har en bruker med game_players: gå til detalj → bekreft faresonen viser block-tekst og INGEN slett-lenke.

---

### Task 3.5: Version bump + CHANGELOG + commit + push

**Step 1:**
```bash
npm version minor --no-git-tag-version
```
**Expected:** `0.6.0 → 0.7.0`.

**Step 2:** CHANGELOG-entry:

```markdown
## [0.7.0] - 2026-05-13

### Added

- **Slett-flyt for spillere på `/admin/spillere/[id]/slett`.** Dedikert bekreftelses-side viser navn, e-post og forklaring. Slett-knappen kaller `auth.admin.deleteUser` via service-role-klienten — `auth.users`-raden slettes, `public.users` cascade-slettes automatisk, og e-posten frigjøres for ny invitasjon.
- **Block-betingelser** på server-side: kan ikke slette deg selv (self-protect), kan ikke slette en spiller som har en eller flere `game_players`-rader.
```

**Step 3:** Commit og push:
```bash
git add app/admin/spillere package.json package-lock.json CHANGELOG.md
git commit -m "$(cat <<'EOF'
feat(admin/spillere): slett-flyt for spillere uten historikk

Ny rute /admin/spillere/[id]/slett er bekreftelses-side som kaller
auth.admin.deleteUser via service-role-klienten. auth.users slettes,
public.users cascade-slettes automatisk via FK fra migration 0001,
og e-posten frigjøres.

Server-side block-betingelser: kan ikke slette deg selv (self-protect),
kan ikke slette en spiller som har én eller flere game_players-rader.
Faresonen på detalj-siden viser disabled state med forklaring når
block-betingelsene er møtt.
EOF
)"
git push
```

---

## Etter alle tre faser

- Bekreft v0.7.0 vises i AppVersionFooter på prod (`tornygolf.no`).
- Oppdater [`TODO.md`](../../TODO.md): fjern «Invitasjons-administrasjon»-blokken, og legg til de tre nye TODO-ene fra design-doc:
  - Endre e-post på registrert spiller (krever service-role for `auth.admin.updateUserById`)
  - Aktivitets-statistikk per bruker (sist innlogget, antall spill)
  - **Arrangør-rolle** — egen brainstorming + RLS-revisjon påkrevd
  - Slett spill helt fra admin-panel (forutsetning for å kunne slette spillere med historikk)
- Commit TODO-oppdateringen som `docs(todo): ...` (skip versjons-bump).

---

## Akseptkriterier — sluttkontroll

- ✅ Re-sende invitasjon uten å gå til SQL → Fase 1
- ✅ Trekke tilbake feil-adressert invitasjon → Fase 1
- ✅ Endre kallenavn og hcp på en spiller uten SQL → Fase 2
- ✅ Slette en testbruker opprettet ved feil → Fase 3
- ✅ Ingen orphaned rows etter sletting → Fase 3 (FK-cascade håndterer det)
- ✅ Alle destruktive handlinger har eksplisitt bekreftelse → Inline to-trinn (Fase 1) og bekreftelses-side (Fase 3)
- ✅ Banner-meldinger er ærlige — ingen «✓ Suksess» når noe feilet → Sjekkes i hver server-action (errno-pattern matching dagens kode)
