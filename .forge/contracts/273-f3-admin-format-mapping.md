# Spec: F3 — Admin format-mapping (matrix-view)

**Issue:** [#273](https://github.com/jdlarssen/golf-app/issues/273)
**Parent epic:** [#270](https://github.com/jdlarssen/golf-app/issues/270)
**Design-doc:** [`docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md`](../../docs/superpowers/specs/2026-05-27-format-katalog-og-wizard-redesign-design.md) — seksjonen «Admin format-mapping-side»
**Bygger på:** F1 (#271 merget) + F2 (#272 merget)

## Problem

F1 introduserte `formats` + `format_intent_mapping`-tabellene som master-katalog. F2 ga wizard-en intent-først flyt som leser fra den katalogen. Men i dag er det INGEN admin-UI for å mutere katalogen — endringer krever migrasjon + kode-deploy. Det er en flaskehals når 18+ nye formats lander (#274–#291) og admin vil eksperimentere med placement.

F3 leverer `/admin/formats` — matrix-view der admin kan toggle synlighet og primary-status per (format, intent), styre cup-eligibility, og deaktivere formats globalt. F1's lese-helpers (`getFormatsForIntent`, `getCupEligibleFormats`) invalideres via `revalidateTag('format-mapping', 'max')` så wizard oppdateres umiddelbart.

## Prior Decisions

Fra epic-design-doc (godkjent 2026-05-27):
- Matrix: rader = formats, kolonner = intents + separat Cup-kolonne
- Per celle: hake (synlig) + stjerne (primary). Cup-kolonnen: kun hake (driver `formats.is_cup_eligible`)
- Mobil-fallback: tabs per intent
- Status: aktiv / inaktiv / ny (= format finnes, men ingen mapping ennå)

Fra denne diskusjonsrunden (2026-05-27):
- **Audit-log: gjenbruk eksisterende `admin_audit_log`-tabell** (etablert i #27, brukt av game-end/approve/reopen). `event_type='format_mapping_change'`. Payload-jsonb bærer `format_slug`, `intent` (eller null), `change_type`, `before`/`after`. Konsistent med øvrig admin-aksjonsmønster.
- **Audit-log er synlig i UI:** vises som liste nederst på `/admin/formats` med siste 50 entries. Ikke bare write-only (avviker fra det eldre F3-utkastet — bruker vil ha synlighet).
- **Optimistic update: ja via React 19 `useOptimistic`**. Cell-state oppdateres instant ved klikk, server-action runs in background. Banner hvis server returnerer feil og state revertes.
- **Mobil-layout: 3 intent-tabs + separat Cup-seksjon**. Kompis/Klubb/Solo som tabs øverst, Cup-seksjon som egen accordion alltid synlig nedenfor. Reflekterer at Cup er strukturelt forskjellig fra `format_intent_mapping`.
- **Admin-tile på `/admin/page.tsx`:** legges til som del av F3 (var Wave-2-følgeoppgave i tidligere F3-utkast — bruker har bekreftet at det skal inn nå).

Fra F1 (#271, merget):
- `formats`-tabell (slug, display_name, icon_key, short_description, scoring_module, is_active, is_cup_eligible)
- `format_intent_mapping`-tabell (format_slug, intent, is_visible, is_primary, sort_order) med CHECK `primary_implies_visible`
- 6 formats seedet: stableford, best_ball, texas_scramble, solo_strokeplay, singles_matchplay (cup-eligible), fourball_matchplay (cup-eligible)
- `Intent`-typen i F1-helperen er `'kompis' | 'klubb' | 'solo'` (Cup er IKKE en intent i `format_intent_mapping` — Cup-eligibility lever på `formats.is_cup_eligible` direkte)

Fra F2 (#272, merget):
- Wizard har 5 steg. Step 2 leser `getFormatsForIntent`. Endringer i F3 må invalidere `format-mapping`-taget for at wizard skal se oppdatert state.

## Design

### Desktop matrix-view

```
┌──────────────────────────────────────────────────────────────────────┐
│ Format-mapping                                       [Vis inaktive]  │
│ Styr hvilke spillformer som vises i wizardens step 2 per arrangement │
├──────────────────────────────────────────────────────────────────────┤
│ Format          │ Status │ Kompis  │ Klubb   │ Solo    │ Cup        │
├─────────────────┼────────┼─────────┼─────────┼─────────┼────────────┤
│ Stableford      │ Aktiv  │ ☑ ★     │ ☑ ★     │ ☑ ★     │ ☐          │
│ Best ball       │ Aktiv  │ ☑ ★     │ ☑ ★     │ ☐ ☆     │ ☐          │
│ Texas scramble  │ Aktiv  │ ☑ ☆     │ ☑ ★     │ ☐ ☆     │ ☐          │
│ Slagspill       │ Aktiv  │ ☐ ☆     │ ☑ ★     │ ☑ ★     │ ☐          │
│ Matchplay       │ Aktiv  │ ☑ ☆     │ ☐ ☆     │ ☐ ☆     │ ☑          │
│ Fourball        │ Aktiv  │ ☐ ☆     │ ☐ ☆     │ ☐ ☆     │ ☑          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Endringslogg (siste 50)                                  │
├──────────────────────────────────────────────────────────┤
│ 14:23  Jørgen  best_ball/klubb → primary on              │
│ 14:22  Jørgen  best_ball/kompis → visible off            │
│ 12:01  Jørgen  fourball_matchplay → cup_eligible on      │
└──────────────────────────────────────────────────────────┘
```

Per celle (non-cup):
- **Hake** (☐/☑) — `format_intent_mapping.is_visible`
- **Stjerne** (☆/★) — `format_intent_mapping.is_primary`. Disabled visuelt hvis cellen ikke er synlig

Per celle (cup-kolonne):
- **Hake** (☐/☑) — `formats.is_cup_eligible`

Per rad:
- **Status-chip**: `Aktiv` (grønn) / `Inaktiv` (grå) / `Ny` (gul — format finnes, men 0 mapping-rader for noen intent og 0 cup-eligibility)
- **Klikk på status-chip**: toggler `formats.is_active`. Inaktive rader gråes ut, alle celler disabled

«Vis inaktive»-toggle øverst (default: skjul). Inaktive rader er gråt ut når synlige.

### Mobile layout (≤ md breakpoint, 768px)

```
┌──────────────────────────────────────┐
│ Format-mapping                       │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ [Kompis] [Klubb] [Solo]              │  ← Tabs (3 intent-tabs)
└──────────────────────────────────────┘
┌──────────────────────────────────────┐
│ Stableford         Aktiv             │
│ ☑ Synlig    ★ Primary                │
├──────────────────────────────────────┤
│ Best ball          Aktiv             │
│ ☑ Synlig    ★ Primary                │
├──────────────────────────────────────┤
│ ... (alle formats, filtrert på tab)  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ ▼ Cup-eligible formats               │  ← Egen accordion (alltid synlig)
├──────────────────────────────────────┤
│ Matchplay        Aktiv     ☑         │
│ Fourball         Aktiv     ☑         │
└──────────────────────────────────────┘

[▼ Endringslogg (siste 50)]            ← Accordion på mobil, alltid utvidet på desktop
```

### Ingen ny tabell

Audit-log gjenbruker `admin_audit_log` (eksisterende tabell, migrasjon `0027_admin_audit_log.sql`). Skjema-mapping:

| Kolonne          | Verdi for F3                                                |
|------------------|-------------------------------------------------------------|
| `actor_user_id`  | admin's user-id (FK til `users`)                            |
| `actor_name`     | snapshot av admin's name (overlever rename/delete)          |
| `event_type`     | `'format_mapping_change'`                                   |
| `target_type`    | `'format'`                                                  |
| `target_id`      | `null` (target_id er uuid; format-slug er ikke uuid)        |
| `payload` (jsonb)| `{ format_slug, intent?, change_type, before, after }`      |

`change_type`-verdier:
- `'visibility'` — `format_intent_mapping.is_visible` endret
- `'primary'` — `format_intent_mapping.is_primary` endret
- `'cup_eligible'` — `formats.is_cup_eligible` endret
- `'active'` — `formats.is_active` endret

`before`/`after` er minimal JSON med relevante felter (eks. `{is_visible: true, is_primary: false}`).

Ingen ny migrasjon — F3 skriver kun INSERT-rader til eksisterende tabell.

### Server-actions (`app/admin/formats/actions.ts`)

Fire mutasjons-actions, en per change-type. Hver:
1. Guarder admin via `requireAdmin(supabase)`
2. Sjekker idempotens (no-op hvis `next === current`)
3. Validerer (server-side guards, se under)
4. Muterer rad i `formats` eller `format_intent_mapping`
5. Skriver `admin_audit_log`-rad via `recordAdminAuditEvent` (eksisterende helper i `lib/admin/auditLog.ts`)
6. Kaller `revalidateTag('format-mapping', 'max')`
7. Returnerer void (form-action) — UI driver re-render via revalidatePath

```typescript
export async function toggleVisibility(formData: FormData): Promise<void>
  // params: format_slug, intent ('kompis'|'klubb'|'solo'), next ('on'|'off')
  // server-validering: hvis next='off' AND is_primary=true → redirect ?error=demote_first

export async function togglePrimary(formData: FormData): Promise<void>
  // params: format_slug, intent, next
  // server-validering: hvis next='off' AND er siste primary for intent → redirect ?error=last_primary
  // hvis next='on' AND is_visible=false → set is_visible=true SAMTIDIG (atomic update, ett audit-event)

export async function toggleCupEligible(formData: FormData): Promise<void>
  // params: format_slug, next
  // skriver til formats.is_cup_eligible direkte

export async function toggleActive(formData: FormData): Promise<void>
  // params: format_slug, next
  // skriver til formats.is_active direkte
```

### Data-helpers (`lib/formats/`)

```typescript
// Ny — admin-view trenger ALLE formats + ALLE mapping-rader (inkl. is_visible=false)
export async function getAllFormatsWithMappings(): Promise<FormatWithMappings[]>

type FormatWithMappings = {
  slug: string;
  display_name: string;
  icon_key: string;
  short_description: string;
  is_active: boolean;
  is_cup_eligible: boolean;
  mappings: Record<'kompis' | 'klubb' | 'solo',
    { is_visible: boolean; is_primary: boolean; sort_order: number } | null
  >;
  // mappings[intent] = null hvis ingen rad → bidrar til "Ny" status
};

// Ny — siste N audit-entries med `event_type='format_mapping_change'`
export async function getFormatMappingAudit(limit = 50): Promise<AuditEntry[]>

type AuditEntry = {
  id: string;          // uuid (admin_audit_log.id)
  actor_name: string;
  format_slug: string;
  intent: 'kompis' | 'klubb' | 'solo' | null;
  change_type: 'visibility' | 'primary' | 'cup_eligible' | 'active';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: string;
};
```

Ingen `unstable_cache` — admin skal alltid se siste state ved navigering hit.

### Client-komponenter

- `FormatMatrix.tsx` (desktop, ≥ md) — full matrix med `useOptimistic` over alle mappings + cup-eligibility + active state
- `FormatTabs.tsx` (mobile, < md) — 3 intent-tabs med per-tab format-liste
- `CupSection.tsx` — felles cup-eligibility-toggle-liste, accordion på mobil
- `AuditLogList.tsx` — siste 50 endringer, accordion på mobil
- `RowStatusChip.tsx` — Aktiv/Inaktiv/Ny pill med klikk-handler for active-toggle

`useOptimistic`-pattern per toggle:

```tsx
const [optimisticData, addOptimistic] = useOptimistic(
  initialData,
  (current, change: {type, formatSlug, intent, value}) => applyChange(current, change),
);

function handleToggle(formatSlug, intent, type, nextValue) {
  startTransition(async () => {
    addOptimistic({ type, formatSlug, intent, value: nextValue });
    const fd = new FormData();
    fd.set('format_slug', formatSlug);
    if (intent) fd.set('intent', intent);
    fd.set('next', nextValue ? 'on' : 'off');
    await serverAction(fd);
    // Hvis server-action kaster (redirect-error/validation), reverteres React optimistic state.
  });
}
```

### Admin-tile på `/admin`

Ny tile «Formats» på `/admin/page.tsx`:

```tsx
<AdminTile
  href="/admin/formats"
  title="Formats"
  description="Styr spillformene i wizarden"
  icon={<FormatsIcon />}
/>
```

Plassering: i admin home-grid, mellom eksisterende tiles. Bruker eksisterende tile-pattern + ny inline SVG-ikon (matrix-aktig, 28×28 currentColor).

### Validering — server-side

`togglePrimary`-action med `next='off'` må sjekke om dette er siste primary for intent-en:

```ts
const { count } = await admin
  .from('format_intent_mapping')
  .select('format_slug', { head: true, count: 'exact' })
  .eq('intent', intent)
  .eq('is_primary', true);
if ((count ?? 0) <= 1) {
  redirect('/admin/formats?error=last_primary');
}
```

`toggleVisibility`-action med `next='off'` må sjekke om raden er `is_primary=true`:

```ts
const { data: row } = await admin
  .from('format_intent_mapping')
  .select('is_primary')
  .eq('format_slug', slug).eq('intent', intent)
  .maybeSingle();
if (row?.is_primary) {
  redirect('/admin/formats?error=demote_first');
}
```

### Validering — client-side guidance

Match server-validation (visuelt, ikke håndhevende):
- Hvis cellen er `is_primary` AND brukeren klikker `is_visible`-haken → vis tooltip «Demote stjerne først»
- Hvis intent har kun 1 primary igjen AND brukeren klikker den stjernen → vis tooltip «Minst 1 primary må være valgt»

Server-action har siste ord — disse er bare hint.

## Edge Cases & Guardrails

- **Format med 0 mapping-rader for ALLE intents + ikke cup-eligible**: Status = `Ny`. Matrix viser alle celler som ☐ ☆. Admin må aktivt klikke for å gi synlighet.
- **Rask doble-klikk**: useOptimistic queuer begge. Hvis første feiler → revertes; andre fortsetter. Idempotens-sjekk i action gjør at if-already-current = no-op.
- **revalidateTag invalidates F1-cache**: Wizard viser oppdatert state ved neste navigation. Ingen websocket nødvendig.
- **Server-action redirect på error**: Med `useOptimistic`, kastet redirect-error fra inn-i-startTransition reverterer optimistic state. Banner viser feilmelding via `?error=`-param.
- **Format som er inaktivt + cup-eligible**: Beholder `is_cup_eligible=true` ved deaktivering. Når reaktivert er state intakt.
- **Klikker på rad som er inaktiv**: Alle celler disabled visuelt. Status-chip-toggle er det eneste klikkbare.
- **Concurrent admin-edits**: Praktisk solo-admin. Last writer wins, audit-log fanger begge.

## Key Decisions

- **Gjenbruk `admin_audit_log`**, ikke ny tabell — etablert mønster i prosjektet
- **Audit-log synlig i UI** — siste 50 entries nederst på siden
- **`useOptimistic` for cell-toggles** — instant UX, server-action håndterer revert ved feil
- **Mobil = 3 intent-tabs + separat Cup-accordion** — reflekterer struktur i datamodellen
- **Cup-kolonnen muterer `formats.is_cup_eligible` direkte** (designet bevisst slik i F1)
- **Admin-tile på `/admin/page.tsx` inkluderes i F3** (per bruker-bekreftelse)
- **Server-actions sjekker idempotens** — no-op hvis verdien ikke endres, beskytter mot doble-audit-rader
- **Ingen websocket/realtime** — admin er typisk single-user
- **`getAllFormatsWithMappings` ikke cachet** — admin-view skal alltid se siste state
- **Ingen sort_order-UI i F3** — sortering bevares ved toggle. Drag-and-drop kan komme i follow-up

**Claude's Discretion:**
- Eksakt mobile breakpoint (Tailwind `md` = 768px standard)
- Audit-entry visningstekst (norsk format med `actor → format/intent → change`)
- Tile-plassering i admin home-grid
- Status-chip-farger (følg eksisterende `StatusChip`-mønster i `components/ui/StatusChip.tsx`)
- Format-ikon i tabell-radene: gjenbruk `formatIconFor` fra `lib/formats/icons.tsx` (F2)

## Success Criteria

- [x] Ny route `app/admin/formats/page.tsx` med matrix-UI (desktop) + tabs-fallback (mobile) — `app/admin/formats/page.tsx` + `FormatsManager.tsx` (responsive `hidden md:block` / `md:hidden`)
- [x] Helper `getAllFormatsWithMappings()` returnerer alle formats + mapping-rader (inkl. nulls) — `lib/formats/getAllFormatsWithMappings.ts`
- [x] Helper `getFormatMappingAudit(limit)` returnerer joined audit-entries fra `admin_audit_log` — `lib/formats/audit.ts`
- [x] 4 server-actions skriver mutasjon + audit-rad + revalidateTag — `app/admin/formats/actions.ts`
- [x] Server-validering: siste primary kan ikke fjernes (`actions.ts:141-150`), is_visible kan ikke avhukes på primary-rad (`actions.ts:58-61`)
- [x] `useOptimistic` på matrix-UI — `FormatsManager.tsx:79-82` + `startTransition`-wrapping i `submit()`
- [x] Mobil: 3 tabs (Kompis/Klubb/Solo) + dedikert Cup-accordion — `FormatsManager.tsx:174-244`
- [x] Status-chip per format-rad: Aktiv / Inaktiv / Ny (klikkbar for active-toggle) — `RowStatusChip.tsx` + `deriveStatus()` i FormatsManager
- [x] Audit-log-seksjon nederst (siste 50 entries, accordion på mobil) — `AuditLogList.tsx` + `page.tsx:74-78`
- [x] Admin-tile på `/admin/page.tsx` → `/admin/formats` — `app/admin/page.tsx:308-313`
- [x] Type C render-tester — `FormatsManager.test.tsx`, `RowStatusChip.test.tsx`, `AuditLogList.test.tsx`
- [x] CHANGELOG-oppføring + version bump (1.40.0 → 1.41.0) — `CHANGELOG.md` 1.41.y series, `package.json` 1.41.0

## Gates

Etter hver chunk:
- [ ] `npx tsc --noEmit` — 0 nye errors
- [ ] `npx vitest run app/admin/formats/` + `lib/formats/` — grønne
- [ ] `npx vitest run` — full suite grønn
- [ ] `npm run lint` — 0 errors

## Files Likely Touched

**Owned by F3 (alle NYE):**
- `lib/formats/getAllFormatsWithMappings.ts` — admin-view-helper (uten unstable_cache)
- `lib/formats/audit.ts` — `getFormatMappingAudit()` + `recordFormatMappingChange()` helpers
- `app/admin/formats/page.tsx` — server-component, gates admin, fetcher data
- `app/admin/formats/FormatMatrix.tsx` — client, desktop matrix med useOptimistic
- `app/admin/formats/FormatTabs.tsx` — client, mobile intent-tabs
- `app/admin/formats/CupSection.tsx` — client, cup-eligibility-liste (mobil-accordion + desktop-rendret)
- `app/admin/formats/AuditLogList.tsx` — client, siste 50 entries
- `app/admin/formats/RowStatusChip.tsx` — client, Aktiv/Inaktiv/Ny pill
- `app/admin/formats/actions.ts` — 4 server-actions
- `app/admin/formats/*.test.tsx` — Type C render-tester
- `components/icons/FormatsIcon.tsx` (eller inline i admin-tile) — ny tile-ikon

**Modifisert:**
- `app/admin/page.tsx` — legg til Formats-tile
- `lib/admin/gameErrorMessages.ts` (eller ny `lib/admin/formatErrorMessages.ts`) — error-koder
- `CHANGELOG.md` + `package.json` — bump til 1.41.0

**Skal IKKE røres:**
- `lib/formats/getFormatsForIntent.ts` (F1 read-side — leser oppdatert state via revalidateTag)
- `lib/formats/validateGameMode.ts` (F1, uberørt)
- F2-komponenter (`IntentSelector`, `FormatGrid`, `CupSetup`, `GameWizard`)
- `admin_audit_log`-skjema (gjenbrukes, ingen migrasjon)

## Dependencies

- **Depends on:** F1 (#271, merget) + F2 (#272, merget) — begge i main
- **Blokkerer:** ingen — F3 er siste foundation-issue i epic #270

## Out of Scope

- Drag-and-drop sort_order-kontroller (sortering bevares; ingen UI for å endre i F3-MVP)
- Bulk-import/eksport av mapping-config
- Audit-log retention/cleanup (`admin_audit_log` vokser ubegrenset også for andre event-types)
- Realtime-broadcast til andre admin-vinduer
- Slette format-rad fra UI (destruktivt; krever direkte DB-aksess)
- Endre format-slug fra UI (slug er PK; cascade-risk)
- Insertion av nye format-rader via UI (krever scoring-modul-kode + migrasjon)

## Deferred Ideas

- «Foreslå standard»-knapp som resetter mapping til seed-default per intent
- Forhåndsvisning av wizard step 2 inline på `/admin/formats` (debug-hjelp for admin)
- Drag-and-drop sort_order-justering
- Bulk-toggle per intent ("aktiver alle Klubb-rader")
- Format-detalj-side med scoring-modul-info og spill-historikk-stats
