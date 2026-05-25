## 📋 Forge-kontrakt tilgjengelig

Det finnes en eksisterende forge-kontrakt for dette issuet på branchen `claude/hardcore-sutherland-ec9542`.

<details>
<summary><strong>Kontrakt: Varsle brukere om ny funksjonalitet — klikk for å vise</strong></summary>

# Spec: Varsle brukere om ny funksjonalitet (in-app drypp + månedlig mail)

**Issue:** [#202](https://github.com/jdlarssen/golf-app/issues/202)
**Branch:** `claude/hardcore-sutherland-ec9542` (worktree)

## Problem

Tørny får jevnt nye funksjoner (se [CHANGELOG.md](../../CHANGELOG.md) — 5 minor-releases siste uka alene), men brukerne oppdager dem sjelden. Det er ingen kanal som forteller dem at noe er nytt før de selv snubler over funksjonen. Resultatet: bygde funksjoner som ingen bruker, og brukere som ikke føler at appen utvikler seg.

Jørgen vil ha to komplementære spor:
1. **In-app drypp** når brukeren er inne i appen (kontekstuell oppdagelse, lav friksjon).
2. **Månedlig mail-digest** for å nå brukere som ikke er aktive (kurert tilbakeblikk, maks én mail per måned).

Aldri mer enn én mail per måned, og in-app-drypp må være diskré nok til ikke å forstyrre admin/scorekort-flyten.

## Research Findings

Søk gjennomført mai 2026.

- **Vercel Cron på Hobby-tier**: kun én kjøring per dag maks; mer-frekvent fyring feiler ved deploy. Månedlig schedule (`0 9 1 * *`) er greit fordi det er sjeldnere enn daglig. Workaround for «kjør månedlig men vær sikker»: bruk daglig cron med `if (today.getDate() !== 1) return` som gate. ([Vercel docs](https://vercel.com/docs/cron-jobs/usage-and-pricing))
- **RFC 8058 one-click unsubscribe** (Gmail/Yahoo krav fra februar 2024 for bulk-sendere): krever `List-Unsubscribe: <https://...>` HTTPS-URL + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header. Endepunkt må svare 200/202 på POST og fullføre opt-out innen 48 timer. ([RFC 8058](https://datatracker.ietf.org/doc/html/rfc8058), [Resend docs](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails))
- **Resend støtter custom headers** per send-call — `headers: { 'List-Unsubscribe': '<...>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }`. Ingen ekstra Audience/Contact-API-bruk nødvendig så lenge vi tracker opt-out selv i `users`-tabellen.
- **Tørny er ikke en bulk-sender** (≪ 5 000 mail/dag mot Gmail/Yahoo), så RFC 8058 er ikke strengt påkrevd, men det er gratis kvalitets-signal å implementere det riktig fra start — gir høyere inbox-placement og forhindrer at brukere markerer mailen som spam.

## Prior Decisions

Carry forward fra eksisterende kontrakter og infra:

- **In-app innboks-infra** (epic #25, shipped `1.15.0`): `notifications`-tabell med polymorf `kind` + JSONB-payload, RLS per user, realtime-publikasjon. Fem eksisterende kinds: `invite`, `peer_approval_request`, `scorecard_submitted`, `scorecard_approved`, `game_finished`. Tilføyelse av ny kind = `0032_notifications.sql`-style CHECK-utvidelse + Zod-schema i `lib/notifications/types.ts`. `notify()`-helper i `lib/notifications/notify.ts` fan-outer per bruker, gjør cache-invalidering, og returnerer `shouldAlsoSendMail` basert på `last_seen_at` > 5 min.
- **NotificationBell + NotificationCard + InboxClient** (`components/notifications/`, `app/innboks/`): leser fra notifications-tabellen, viser badge ved ulest, deeplink per kind. Utvidelse for ny kind = EMOJI-entry + buildCardContent-case + buildDeeplink-case.
- **`requireAdmin()` + `requireAdminOrTrustedCreator()`** (`lib/admin/auth.ts`, shipped `1.17.0`): single-source-helpers for admin-gating. Bruk `requireAdmin()` for `/admin/lanseringer`.
- **Mail-pattern** (`lib/mail/*.ts`): Resend-klient via `process.env.RESEND_API_KEY`, fra-adresse via `resolveFromEmail()`, inline-HTML med `escapeHtml()`, best-effort send med `Promise.allSettled` + console.error på rejection. Snapshot-tester for subject + plain-text-versjon.
- **`users.last_seen_at`** (`0019_users_last_seen_at.sql`): skrives av `proxy.ts` ved hver innlogget request (debouncet 30 min). Tilgjengelig for aktivitets-filter, MEN ikke i bruk for digest-recipient-filter (alle opt-in-brukere får, uavhengig av aktivitet — Tørny er for liten til at filter er verdt det).
- **Profile-form-arkitektur** (`app/profile/page.tsx` + `ProfileFormBody.tsx`): client component med dirty-tracking + useFormStatus pending-state. Lagring via `updateProfile`-server-action med revalidatePath. Utvidelse for opt-out-toggle = nytt felt + ny action-branch.

## Design

### 1. Datamodell (migrasjon `0034_product_updates.sql`)

```sql
-- Authoritative source: én rad per publisert lansering.
create table public.product_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,           -- «Texas scramble er ute!»
  body text not null,            -- 1-3 setningers beskrivelse på Jørgen-språk
  link text,                     -- Valgfri intern rute: «/admin/games/new». Validert i app-laget til å starte med '/'.
  cta_label text,                -- Valgfri knapp-tekst når link finnes: «Prøv det», «Se mer»
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Audit + idempotens for månedlig digest-utsending.
create table public.product_update_digests (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,    -- 1. mai 2026
  period_end date not null,      -- 31. mai 2026 (inkl.)
  sent_at timestamptz not null default now(),
  sent_by uuid references public.users(id) on delete set null,   -- null = cron-trigget
  recipient_count int not null,
  update_ids uuid[] not null,    -- product_updates.id-er inkludert i digest
  unique (period_start, period_end)
);

-- Opt-out for månedlig mail. Timestamp i stedet for boolean = audit + re-opt-in trivielt.
alter table public.users
  add column if not exists product_updates_unsubscribed_at timestamptz;

-- Utvid notifications.kind-CHECK.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'invite', 'peer_approval_request', 'scorecard_submitted',
    'scorecard_approved', 'game_finished', 'product_update'
  ));

-- RLS for product_updates: alle innloggede brukere kan SELECT
-- (digest-flaten viser tidligere oppføringer); kun admin kan INSERT
-- (håndheves via server-action + requireAdmin, men policy gir defense-in-depth).
alter table public.product_updates enable row level security;
create policy product_updates_select_authenticated
  on public.product_updates for select to authenticated using (true);
-- INSERT/UPDATE/DELETE: ingen policy → kun service-role (admin-client) får skrive.

alter table public.product_update_digests enable row level security;
-- Ingen SELECT/INSERT-policy → kun admin-client. UI leser via server-action med getAdminClient().
```

### 2. Ny notification-kind `product_update`

`lib/notifications/types.ts`:
```ts
const productUpdateSchema = z.object({
  source_id: uuid,        // product_updates.id
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().startsWith('/').optional(),  // Kun interne ruter
  cta_label: z.string().min(1).optional(),
});
```

`NotificationCard.tsx`:
- EMOJI: `product_update: '✨'`
- `buildCardContent`: `title = payload.title`, `detail = payload.body` (truncate i UI per eksisterende CSS).

`InboxClient.tsx` `buildDeeplink`:
- `case 'product_update'`: returner `payload.link ?? '/innboks'` (link er valgfri; uten link blir tap-en på kortet en no-op forblir-i-innboks).

### 3. Admin-flate: `/admin/lanseringer`

Ny rute under Sekretariatet (gated av `requireAdmin()`):

**`app/admin/lanseringer/page.tsx`** (server component):
- TopBar med backHref `/admin`, kicker «Lanseringer»
- Skjema-card øverst: «Publiser ny lansering» med felter `title`, `body` (textarea), `link` (valgfri), `cta_label` (valgfri, disabled hvis link tom), submit-knapp «Publiser»
- Digest-card under: «Månedsbrev»
  - Viser status for inneværende måned: «Månedsbrevet for [måned] er ikke sendt ennå» eller «Månedsbrevet for [måned] gikk ut [dato] kl. [tid] til [N] mottakere»
  - Knapp «Send månedsbrev nå» — disabled hvis allerede sendt for inneværende periode, ellers konfirm-modal «Sender månedsbrev for [måned] til [N] påmeldte. Vil du fortsette?»
- Liste-card: «Tidligere lanseringer» — siste 20, hver med tittel, dato, antall fan-out-notifikasjoner (count fra `notifications` der `kind='product_update'` og `payload->>'source_id' = id`), evt. link/CTA

**`app/admin/lanseringer/actions.ts`**:
- `publishProductUpdate(formData)`:
  1. `requireAdmin()`, parse form, validér felter (zod)
  2. `INSERT INTO product_updates RETURNING id`
  3. Hent alle user-id-er fra `users`
  4. Fan-out via `Promise.allSettled(users.map(u => notify({ userId: u.id, kind: 'product_update', payload: { source_id, ...fields } })))` (best-effort, ikke blokker på rejection)
  5. `revalidatePath('/admin/lanseringer')` + redirect tilbake med success-flag
- `sendDigestNow()`:
  1. `requireAdmin()`
  2. Beregn `periodStart = first-of-previous-month`, `periodEnd = last-of-previous-month` (i Europe/Oslo)
  3. Sjekk `product_update_digests` — hvis row finnes for perioden, returner error «Månedsbrevet er allerede sendt for [måned]»
  4. Query `product_updates` der `created_at` i perioden → hvis tom liste, returner error «Ingen lanseringer å sende ut for [måned]»
  5. Query påmeldte brukere: `users where product_updates_unsubscribed_at is null and email is not null`
  6. Send via `sendProductUpdateDigest(...)` (se §5) — best-effort per mottaker
  7. `INSERT INTO product_update_digests` med sent_by = admin-userId, recipient_count, update_ids

### 4. In-app banner på `/`

**`components/products/ProductUpdateBanner.tsx`** (client component):
- Mount i `app/page.tsx` like under TopBar (over greeting-headeren)
- Tar `userId: string | null` som prop
- Query via `useEffect` + fetch til ny intern `/api/product-updates/latest-unread` (eller direkte Supabase-call via klient-SDK med RLS) — returnerer mest nylige `notification` med `kind='product_update'` og `read_at IS NULL`, eller `null`
- Layout: card med tynn champagne-stripe på venstre kant, sparkle-emoji eller `✨`, title (font-medium), body (text-sm muted), valgfri CTA-knapp (`<SmartLink>` til payload.link), og lukke-knapp «✕» på høyre kant
- Dismiss: optimistisk fjern banneret + kall server-action `markOneAsRead(notificationId)` (eksisterende, fra `app/innboks/actions.ts`)
- Returnerer `null` hvis ingen ulest, eller hvis userId null
- Tap-target ≥44px på lukke-knappen og CTA-en

### 5. Mail: månedlig digest

**`lib/mail/productUpdateDigest.ts`**:
- `sendProductUpdateDigest(params: { to: string, recipientName: string, periodLabel: string, updates: Array<{title, body, link?, cta_label?}>, unsubToken: string })`
- Subject: `Nytt i Tørny — ${periodLabel}` (f.eks. «Nytt i Tørny — mai 2026», bruk `formatMonthLongNb`)
- HTML-body følger eksisterende mail-pattern (samme container/farger som `inviteNotification.ts`):
  - Header: Tørny-logo
  - Intro: «Dette var nytt i Tørny i [måned]:»
  - Per oppdatering: tittel (h3), body (p), valgfri CTA-knapp lenket til `https://tornygolf.no${link}`
  - Footer: «Du får denne mailen fordi du er på Tørny. [Meld deg av](unsub-link). Du kan også styre det fra [Profil](https://tornygolf.no/profile).»
- Plain-text-versjon parallelt (samme content)
- **Headers**: `List-Unsubscribe: <https://tornygolf.no/api/unsubscribe/product-update?token=${unsubToken}>`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- Best-effort send, kaster ikke ved Resend-error

**`lib/productUpdates/unsubscribeToken.ts`**:
- `signUnsubToken(userId: string): string` — HMAC-SHA256 av `${userId}.${expIso}` med secret `process.env.PRODUCT_UPDATE_UNSUB_SECRET`, returnerer base64url-encoded `${userId}.${expIso}.${sig}`. Exp = 1 år.
- `verifyUnsubToken(token: string): { userId: string } | null` — pakker ut, verifiserer HMAC i constant-time, sjekker exp.

### 6. Unsub-endepunkt: `/api/unsubscribe/product-update`

**`app/api/unsubscribe/product-update/route.ts`**:
- GET med `?token=...`: verifisér token. Hvis OK → `UPDATE users SET product_updates_unsubscribed_at = now() WHERE id = userId`, render enkel HTML-side med Tørny-logo + «Du er meldt av månedsbrevet. Du kan melde deg på igjen fra [Profil](/profile).» Hvis dårlig token → 400 «Ugyldig eller utløpt lenke».
- POST med `?token=...` (mail-klient one-click per RFC 8058): samme verifisering + DB-skriv, returner 200 med tom body.
- Bruker `getAdminClient()` — endepunktet er uautentisert (kjører fra mail-klient).

### 7. Cron: månedlig digest

**`app/api/cron/product-update-digest/route.ts`**:
- GET-handler, auth via `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel Cron sender dette automatisk)
- Sjekk `today.getDate() === 1` (i Europe/Oslo) → ellers return 200 «Not the 1st, skipping»
- Sjekk dupe via `product_update_digests` — hvis row finnes for forrige måned, return 200 «Already sent»
- Kjør samme logikk som `sendDigestNow()`, men med `sent_by = null`
- Return JSON `{ ok: true, sent: N }` for Vercel-loggene

**`vercel.json`** (ny fil hvis den ikke finnes):
```json
{
  "crons": [
    { "path": "/api/cron/product-update-digest", "schedule": "0 8 * * *" }
  ]
}
```
(Daglig 08:00 UTC = 09:00/10:00 norsk avhengig av sommertid. Daily-pattern + intern dato-gate er sikrere enn `0 8 1 * *` på Vercel Hobby.)

### 8. Opt-out-toggle i Profil

`ProfileFormBody.tsx` får en ny seksjon nederst «Mail-innstillinger» med checkbox/toggle «Få månedsbrev fra Tørny med oppsummering av nye funksjoner». Dirty-tracking utvides til å inkludere denne. `updateProfile`-action håndterer både eksisterende felter og toggle — setter `product_updates_unsubscribed_at = null` (påmelding igjen) eller `now()` (avmelding).

## Edge Cases & Guardrails

- **Cron fyrer + admin har allerede sendt**: `product_update_digests`-row finnes → cron skipper, returnerer 200 med besked. Idempotent.
- **Ingen product_updates forrige måned**: skip digest helt, ikke send tom mail. Log i Vercel.
- **Admin trykker «send nå» to ganger raskt**: server-action sjekker `product_update_digests`-row på inneværende periode; andre kall får error-banner «Allerede sendt».
- **Notification fan-out feiler delvis**: `Promise.allSettled` per bruker, log per rejection (`console.error('[publishProductUpdate] notify failed for user X', err)`), continue. Brukere som mislykkes ser ikke notifikasjonen, men product_updates-row er fortsatt opprettet → vises i admin-listen. Akseptabel.
- **Bruker slettes mens i product_updates-fan-out**: `notify()` returnerer `shouldAlsoSendMail: false` ved FK-error (allerede håndtert i eksisterende kode).
- **Link-feltet validert til intern-only** (`startsWith('/')`): forhindrer at en kompromittert admin-konto sender phishing-link via mail/banner. Hvis admin trenger ekstern link, må de gjøre det manuelt utenfor systemet.
- **Unsub-token utløpt** (> 1 år): vis side med «Lenken er utløpt. Logg inn og meld deg av fra [Profil](/profile).» — håndteres som 400.
- **Bruker er allerede opt-out og klikker unsub**: idempotent, set `product_updates_unsubscribed_at = now()` (oppdaterer timestamp), vis samme suksess-side.
- **Bruker har ingen email i users-tabellen**: ekskluderes fra digest-recipient-listen. Fan-out av in-app notification skjer fortsatt (in-app er primær kanal).
- **Banner og notifikasjon ut av sync**: dismiss av banner = marker tilhørende notification som lest → bjelle-prikken og banner forsvinner samtidig. Marker som lest i innboks = banner forsvinner ved neste mount.
- **Mail leveres til en bruker som senere blir slettet**: unsub-link funker fortsatt (token-verifisering klarer ikke å oppdatere ikke-eksisterende user-row → returner 404). Akseptabel kant — slettet bruker har uansett ikke kontoen lenger.
- **Banner vises hvis bruker har 20 uleste product_updates**: viser kun nyeste; resten er tilgjengelig i /innboks. Ikke vis stack.
- **Cron-secret ikke satt i prod**: deploy fungerer fortsatt, men cron-endepunktet returnerer 401 på alle requests → ingen digest sendes. Loggføres ved første feilede invocation.

## Key Decisions

- **Reuse `notifications`-tabellen for per-bruker-state, ny `product_updates`-tabell for authoritative content**: Hybrid gir clean admin-list-view + per-user read_at + idempotent fan-out. Alternativet (kun notifications) gjør admin-listen og digest-aggregeringen rotete (distinct payloads, ingen audit av enkelt-publisering).
- **Opt-out (på by default) for månedlig mail**: brukerne får mailen automatisk + 1-klikks-unsub i footer + Profil-toggle. Standard for product-digest. Risikoen for spam-perception er liten siden vi maks sender én mail per måned med faktisk produkt-nytt.
- **Per-notification `read_at` for "seen this"-state**: gjenbruker eksisterende infra (NotificationBell-badge, /innboks-listing). Ikke per-feature-seen-tracking — for komplekst for MVP.
- **Auto-aggregert digest fra admin-curated `product_updates`**: ingen CHANGELOG-scraping. Admin trykker «Publiser» én gang per lansering; digest er bare en månedlig recap. Bevarer redaksjonell kontroll uten månedlig toil.
- **Begge: notifikasjon + dismissible banner på `/`**: notifikasjon for innboks-konsistens, banner for høy oppdagelse på hoved-flaten. Dismiss = marker som lest i én atomisk operasjon.
- **Dedikert rute `/admin/lanseringer`**: gir audit-historikk + naturlig hjem for «send digest nå»-knappen. Inline-form på `/admin` ville drukne i den allerede tette Sekretariat-forsiden.
- **Begge: cron + manuell override-knapp**: cron som default trygghet (zero-touch), manuell knapp for redaksjonell kontroll. Begge bruker samme `product_update_digests`-table for idempotens.
- **Link validert til intern-only (`startsWith('/')`)**: defense mot phishing-misbruk via mail/banner-kanalen. Trade-off: kan ikke peke til Discord/eksterne ressurser. Akseptabelt for MVP.

**Claude's Discretion:**
- Eksakt visuell stil på banneret — følg champagne-stripe-konvensjonen fra `NotificationCard`-uleste-state. Kompakt høyde, ikke push greeting-headeren langt ned.
- Mail-template's farger og typografi — gjenbruk inline-styles fra `inviteNotification.ts`/`gameFinishedNotification.ts` for konsistens. Snapshot-test sikrer at fremtidige endringer er bevisste.
- Norsk månedsformatering (`formatMonthLongNb`) — hvis ikke finnes, legg til i `lib/format/date.ts` med samme stil som eksisterende helpers.
- Plassering av Mail-innstillinger-seksjonen i Profil — under hcp-feltet, før InviteFriendForm-en. Sticky-feeling «kontoinnstillinger»-gruppering.
- Toast/banner-tekst på admin-suksess («Lanseringen er ute hos 47 brukere», «Månedsbrevet gikk ut til 32 mottakere») — tone-of-voice fra eksisterende admin-actions.

## Success Criteria

- [ ] **K1:** Migrasjon `0034_product_updates.sql` finnes og kjøres rent. Tre nye DB-objekter: `product_updates`-tabell, `product_update_digests`-tabell, `users.product_updates_unsubscribed_at`-kolonne. Notifications-kind-CHECK utvidet med `product_update`. RLS-policy på `product_updates` lar alle innloggede SELECT.
- [ ] **K2:** `lib/notifications/types.ts` har `product_update`-kind med zod-schema (source_id, title, body, link?, cta_label?). `parseNotificationPayload('product_update', ...)` aksepterer gyldig payload og avviser ugyldig. Unit-test passerer.
- [ ] **K3:** `app/admin/lanseringer/page.tsx` rendres for admin, gated av `requireAdmin()`. Skjema for publisering, knapp for «send digest nå», liste over tidligere lanseringer. Non-admin redirectes til `/`.
- [ ] **K4:** `publishProductUpdate`-server-action inserter row i `product_updates`, fan-outer notifications til alle users, returnerer success-redirect. Verifiserbart: SQL `select count(*) from notifications where kind='product_update' and payload->>'source_id' = '<new_id>'` matcher antall users.
- [ ] **K5:** Banner-komponent `<ProductUpdateBanner />` mountes i `app/page.tsx`. Når innlogget bruker har en ulest `product_update`-notifikasjon, vises banner med title/body/optional CTA. Lukke-knapp markerer som lest og fjerner banneret optimistisk. Når ingen ulest, returnerer komponenten null.
- [ ] **K6:** `sendProductUpdateDigest`-mail-helper sender via Resend med subject `Nytt i Tørny — [måned]`, inkluderer `List-Unsubscribe`-headere per RFC 8058, og lister alle product_updates fra forrige kalendermåned. Snapshot-test låser HTML + plain-text.
- [ ] **K7:** Cron-endepunkt `/api/cron/product-update-digest` gated av `CRON_SECRET`, skipper hvis ikke-dato-1, skipper hvis allerede sendt for perioden (sjekk `product_update_digests`), ellers sender og inserter audit-row. `vercel.json` registrerer schedule `0 8 * * *`.
- [ ] **K8:** Unsub-endepunkt `/api/unsubscribe/product-update` håndterer både GET (browser, viser HTML-side) og POST (mail-klient one-click, returnerer 200). Setter `users.product_updates_unsubscribed_at = now()`. Token verifisert via HMAC + exp.
- [ ] **K9:** Profil-form har ny Mail-innstillinger-toggle. Toggle endrer `product_updates_unsubscribed_at` i DB. Dirty-tracking inkluderer toggle. Test passerer.
- [ ] **K10:** Eksisterende test-suite + nye tester grønne (`npm test`). `npm run lint` + `npm run build` grønne.
- [ ] **K11:** Version bumpet `1.17.0` → `1.18.0` (minor — ny bruker-synlig funksjon). CHANGELOG-oppføring med stakeholder-tagline. 1.17.y-serien wrappet i `<details>`.

## Gates

Kjøres etter hver chunk:

```bash
npm run lint
npm test
npm run build
```

Spesielt etter mail-helper-endringer: kjør snapshot-test scopet (`npm test -- productUpdateDigest`).

Etter banner-endringer: spot-sjekk visuelt på Vercel-preview-URL (mobil-viewport, både med og uten ulest notification).

## Files Likely Touched

| Fil | Status | Hva |
|---|---|---|
| `supabase/migrations/0034_product_updates.sql` | NY | Tabeller + kolonne + CHECK-utvidelse + RLS |
| `lib/notifications/types.ts` | ENDRET | Legg til `product_update`-kind + zod-schema |
| `lib/notifications/types.test.ts` | ENDRET | Tester for ny kind |
| `lib/productUpdates/publish.ts` | NY | `publishProductUpdate` core-logikk (insert + fan-out) |
| `lib/productUpdates/digest.ts` | NY | `sendDigestForPeriod` core-logikk (query + send + audit-row) |
| `lib/productUpdates/unsubscribeToken.ts` | NY | HMAC sign/verify-helpers |
| `lib/productUpdates/unsubscribeToken.test.ts` | NY | Unit-test for token round-trip + tampering + exp |
| `lib/mail/productUpdateDigest.ts` | NY | Resend-mail med List-Unsubscribe-headere |
| `lib/mail/productUpdateDigest.test.ts` | NY | Snapshot-test for HTML + plain-text + subject |
| `lib/format/date.ts` | ENDRET (kanskje) | `formatMonthLongNb` hvis ikke finnes |
| `app/admin/lanseringer/page.tsx` | NY | Admin-flate, skjema + digest-status + liste |
| `app/admin/lanseringer/actions.ts` | NY | `publishProductUpdate`, `sendDigestNow`-server-actions |
| `app/admin/lanseringer/actions.test.ts` | NY | Tester for begge actions inkl. idempotens |
| `app/api/cron/product-update-digest/route.ts` | NY | Cron-handler |
| `app/api/unsubscribe/product-update/route.ts` | NY | GET + POST handlers |
| `components/products/ProductUpdateBanner.tsx` | NY | Client-banner på `/` |
| `components/products/ProductUpdateBanner.test.tsx` | NY | Test for visning + dismiss |
| `app/page.tsx` | ENDRET | Mount `<ProductUpdateBanner userId={...} />` |
| `components/notifications/NotificationCard.tsx` | ENDRET | EMOJI + buildCardContent for `product_update` |
| `app/innboks/InboxClient.tsx` | ENDRET | buildDeeplink-case for `product_update` |
| `app/profile/page.tsx` | ENDRET | Hent `product_updates_unsubscribed_at`, pass til form |
| `app/profile/ProfileFormBody.tsx` | ENDRET | Ny toggle + dirty-tracking |
| `app/profile/actions.ts` | ENDRET | Håndter toggle-felt |
| `vercel.json` | NY (eller ENDRET) | Cron-schedule |
| `proxy.ts` | ENDRET (sjekk) | Verifiser at `/api/unsubscribe/*` og `/api/cron/*` bypasser auth-gate |
| `package.json` | ENDRET | Bump `1.17.0` → `1.18.0` |
| `CHANGELOG.md` | ENDRET | Ny `## 1.18.y`-tema-heading + entry; wrap `1.17.y` i `<details>` |
| `.env.example` (hvis finnes) | ENDRET | Dokumentér `CRON_SECRET` + `PRODUCT_UPDATE_UNSUB_SECRET` |

## Out of Scope

- **Per-feature seen-tracking** (badge på menypunkter for nye funksjoner) — vurderes som v2 hvis adopsjon viser at vi trenger mer kontekstuell oppdagelse enn banner + innboks gir.
- **Coachmarks/tooltips på første visning av ny funksjon** — separat issue om vi vil ha det.
- **Auto-generering av digest fra CHANGELOG-taglines** — admin curates manuelt; digest er bare aggregat. Hvis admin glemmer å publisere, blir digest tom og hopper over.
- **Push-notifikasjoner** (web push API) — eget infra-løft, separat issue.
- **Aktivitets-filter på digest-recipients** (kun send til brukere aktive siste N dager) — Tørny er for liten til at dette er verdt det per nå.
- **Re-publisering av product_updates til nye brukere som signet seg opp etter** — nye brukere ser kun product_updates publisert etter deres signup (de eldste lever bare i digest hvis de har vært på). Akseptabel kant.
- **Eksterne links i product_update.link** — kun interne ruter (`startsWith('/')`) for sikkerhet.
- **Schedule-konfigurerbar tid for digest** — hard-coded 08:00 UTC daglig cron + 1.-dato-gate.
- **Per-recipient personalisering av digest-innhold** — alle får samme content.
- **Innboks-filter «kun product_updates»** — innboks viser alt mikset; brukere som kun vil se nyheter går til evt. framtidig dedikert flate.
- **A/B-testing av subject/copy** — manuell iterasjon basert på open-rate fra Resend-dashboard hvis ønskelig.

## Deferred Ideas (capture from discussion)

Ingen for nå — brukerens issue-text dekket et bredt mulighetsrom; vi har plukket MVP og parkert resten under «Out of Scope».

</details>

