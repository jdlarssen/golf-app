# Kontrakt #616 — Innboks: arkiver/fjern, «Tøm leste» og 2-linjers undertekst

**Issue:** [#616](https://github.com/jdlarssen/golf-app/issues/616) — «Innboks mangler lest/ulest-status, ulest-teller og rydding»
**Branch:** `claude/peaceful-moser-b3aee5`
**Type:** enhancement, `area:ui`

## Kontekst — issuet er delvis stale

#616 ble skrevet under en nettleser-gjennomgang og lister fem mangler. Kode-utforskning viser at **tre allerede er bygget**:

| #616-påstand | Faktisk status |
|---|---|
| Ingen visuell lest/ulest | ✅ Finnes — champagne-stripe + `font-medium` + `opacity-80` (`NotificationCard.tsx:74–92,102–108`) |
| Ingen «merk alle som lest» | ✅ Finnes — `markAllAsRead`-knapp (`InboxClient.tsx:106–119`, `actions.ts:26`) |
| Ingen badge på bunn-nav | ◐ Prikk finnes (`BottomNav.tsx:80,113`) — bevisst «kun signal, ingen telletall» |
| **Ingen måte å fjerne varsler** | ❌ Reelt hull — ingen delete/arkiv; RLS har kun `select`+`update` |
| «Resultatet er klart» dupliserer Hjem | ❌ Reell støy |
| **Undertekster trunkeres** | ❌ Reelt — `truncate` på `NotificationCard.tsx:109` |

## Eier-beslutninger (AskUserQuestion, 2026-06-14)

1. **Fjern-UX:** ✕-knapp på hvert kort **+** «Tøm leste»-knapp (arkiverer alle leste i ett trykk).
2. **game_finished-støy:** **Behold** varselet — den nye arkiv/lest-funksjonen lar brukeren rydde det selv. Ingen kilde-demping, ingen sammenslåing.
3. **Ulest-badge:** **Behold prikken** — ikke bytt til tall. (Issuets «ulest-teller»-ønske avvises bevisst; prikken dekker den funksjonelle nytten.)

## Scope

### Inkludert
- **A. Soft-archive-infrastruktur.** Ny `notifications.archived_at timestamptz`-kolonne (migrasjon 0098). Arkivering setter `archived_at = now()` **og** `read_at = now()` (så en arkivert-mens-ulest rad ikke etterlater en hengende bunn-nav-prikk). Innboks-query filtrerer `archived_at is null`. Rader slettes **aldri** — beholdes i DB (gjenfinnbar), bare skjult fra lista.
- **B. ✕-knapp per kort** som arkiverer det ene varselet (optimistisk fjerning fra lista).
- **C. «Tøm leste»-knapp** øverst (ved siden av «Marker alle som lest») som arkiverer alle **leste** varsler i ett trykk. Vises kun når minst ett lest varsel finnes.
- **D. 2-linjers undertekst** — `truncate` → `line-clamp-2` på detalj-linja.

### Ekskludert (bevisst)
- Tall-badge på bunn-nav (beholder prikk).
- Demping/sammenslåing av game_finished ved kilde.
- Sveip-til-arkiver (eier valgte ✕-knapp, ikke sveip).
- Un-arkiver / angre-UI (rader beholdes i DB, men ingen gjenopprettings-flate i denne runden).
- Hard delete + ny RLS `delete`-policy (soft-archive bruker eksisterende `notifications_update_own`).

## Gray-areas løst (tekniske, mine beslutninger)

- **Soft-archive framfor hard delete.** Matcher eksisterende soft-mønster (`read_at`, `product_updates_unsubscribed_at`), trenger ingen ny RLS-policy (en `archived_at`-UPDATE dekkes av `notifications_update_own`), og `useUnreadNotificationsCount` (som *bevisst ignorerer DELETE-events*, `useUnreadNotificationsCount.ts:79–81`) trenger ingen endring. Hard delete ville krevd ny RLS-policy + DELETE-event-håndtering i hooken + replica-identity-fikling. Soft-archive er strengt enklere og null-risk for badge-konsistens.
- **Arkivering setter `read_at` også.** Bunn-nav-prikken teller `read_at is null` uavhengig av archived. En unread+archived rad ville ellers telt mot prikken men vært usynlig (foreldreløs prikk). Å sette begge unconditionally er trygt: realtime-UPDATE-handleren (`useUnreadNotificationsCount.ts:106–115`) dekrementerer korrekt på null→satt, og for allerede-leste rader er en ny `read_at`-verdi usynlig (raden er skjult).
- **✕ må være et søsken-element, ikke nestet.** `NotificationCard` er i dag én `<button>` som rot. Nestede interaktive elementer er ugyldig HTML. Restrukturér til `<div className="relative">` som wrapper (a) hoved-tap-`<button>` (emoji + innhold + tid) og (b) en separat ✕-`<button>` posisjonert så den ikke kolliderer med tidsstemplet. Klikk på ✕ (søsken) trigger ikke kort-tappen. ✕ trenger ≥44px tap-target (padding rundt mindre ikon).
- **Ny server-helper `archiveNotifications` i `lib/notifications/`** (parallell til `markRead.ts`), bruker `getServerClient()` (RLS via cookies), `revalidateTag(\`notifications-${userId}\`)`. To server-actions i `innboks/actions.ts`: `archiveOne(id)` og `clearRead()`.
- **Migrasjon 0098** — siste er 0097 (lokal + origin/main enige). Partial-indeks `notifications_user_active_created on (user_id, created_at desc) where archived_at is null` legges til så den dominante innboks-queryen (som nå alltid filtrerer `archived_at is null`) er indeks-dekket — konsistent med fil-ens eksisterende partial-index-mønster. Migrasjon **kjøres mot prod via Supabase MCP `apply_migration` etter at PR er merget** (ny kolonne er additiv og bakoverkompatibel; gammel kode bryr seg ikke).

## Suksess-kriterier

- [x] **C1.** Migrasjon `0098_notifications_archived_at.sql` legger til `archived_at timestamptz` (nullbar) + partial-indeks `where archived_at is null`. *Bevis: `supabase/migrations/0098_notifications_archived_at.sql`; `apply_migration` kjørt mot prod (success:true); `execute_sql` bekrefter `archived_at_type = "timestamp with time zone"` + `index_def = CREATE INDEX notifications_user_active_created ... WHERE (archived_at IS NULL)`.*
- [x] **C2.** `lib/notifications/archive.ts` eksporterer `archiveNotifications({ userId, notificationId? })`: med `notificationId` → arkiver den ene (sett `archived_at` + `read_at`); uten → arkiver alle leste (`.not('read_at','is',null).is('archived_at',null)`, sett `archived_at`). Best-effort `console.error` + `revalidateTag`. *Bevis: `lib/notifications/archive.ts:34–63`; tsc exit 0.*
- [x] **C3.** `innboks/actions.ts` har `archiveOne(notificationId)` og `clearRead()` server-actions, begge henter `userId` via `getProxyVerifiedUserId()` (ikke klient). *Bevis: `app/[locale]/innboks/actions.ts:44–66`.*
- [x] **C4.** Innboks-query (`innboks/page.tsx`) filtrerer `.is('archived_at', null)` så arkiverte varsler ikke vises. *Bevis: `app/[locale]/innboks/page.tsx:38`.*
- [x] **C5.** `NotificationCard` har en ✕-arkiv-knapp som søsken (ikke nestet) av hoved-tap-knappen, `w-11`-tap-target, lokalisert aria-label `t('archiveAria')`. Klikk kaller `onArchive`, ikke `onTap`. *Bevis: `components/notifications/NotificationCard.tsx:96–137` (div-rot + to søsken-knapper); test «arkiverer kortet og navigerer IKKE når ✕ klikkes» grønn.*
- [x] **C6.** `InboxClient`: ✕ fjerner kortet optimistisk + kaller `archiveOne(id)`; navigerer **ikke**. «Tøm leste» fjerner alle leste optimistisk + kaller `clearRead()`, vises kun når ≥1 lest finnes. *Bevis: `InboxClient.tsx:90–106,116–135`; 3 nye tester grønne (32 totalt passerer).*
- [x] **C7.** Detalj-linja bruker `line-clamp-2` (ikke `truncate`) — undertekst bryter til 2 linjer. *Bevis: `components/notifications/NotificationCard.tsx:122`.*
- [x] **C8.** Nye i18n-nøkler (`inbox.archiveAria`, `inbox.clearRead`, `inbox.clearingPending`) finnes i **både** `messages/no.json:58–60` og `messages/en.json:58–60`; `catalogParity`-test grønn (del av 32). Norsk copy kjørt gjennom `humanizer` (tagline strammet, UI-strenger rene). *Bevis: nøkler + parity-test grønn.*
- [x] **C9.** Versjon bumpet 1.128.1 → 1.129.0 (minor — ny bruker-synlig feature) + CHANGELOG-oppføring (nytt tema `## 1.129.y — Rydd i innboksen`). *Bevis: `package.json` version 1.129.0; `CHANGELOG.md:20–43`.*

## Gates (kjøres scoped til det som endres)

```bash
# Type-sjekk hele appen (nye GameMode-/exhaustive-feller fanges kun her)
npm run build      # eller: npx tsc --noEmit

# Co-lokaliserte tester for endrede filer
npx vitest run app/[locale]/innboks lib/notifications messages
```

- Co-lokalisert test for hver endret fil + `tsc --noEmit` (per feedback: gate må inkludere endret fils egen *.test).
- Pre-commit-hook (humanizer-advarsel) + commit-msg-hook (versjon-bump) må passere uten `--no-verify`.

## Filer som røres

- `supabase/migrations/0098_notifications_archived_at.sql` *(ny)*
- `lib/notifications/archive.ts` *(ny)*
- `app/[locale]/innboks/actions.ts` — `archiveOne` + `clearRead`
- `app/[locale]/innboks/page.tsx` — `.is('archived_at', null)`
- `app/[locale]/innboks/InboxClient.tsx` — ✕-håndtering + «Tøm leste» + optimistisk fjerning
- `app/[locale]/innboks/InboxClient.test.tsx` — utvid eksisterende (ikke ny fil; Type C = maks én komponent-testfil)
- `components/notifications/NotificationCard.tsx` — restrukturér til div+to knapper, `line-clamp-2`
- `messages/no.json` + `messages/en.json` — `inbox.archiveAria`, `inbox.clearRead`, `inbox.clearingPending`
- `package.json` + `CHANGELOG.md` — minor-bump

## Test-plan (per docs/test-discipline.md)

- **Type C (UI):** utvid eksisterende `InboxClient.test.tsx` — ✕ kaller `archiveOne` + fjerner kort + navigerer ikke; «Tøm leste» kaller `clearRead` + skjules når alt uleст. Ingen ny komponent-testfil.
- **i18n:** `catalogParity` håndhever no/en-paritet automatisk.
- **Ikke:** unit-test for `archive.ts` (DB-I/O-wrapper, ikke ren logikk — `markRead.ts` har heller ingen). Ingen E2E (ingen ny golden-path-flyt).
