# Spec: Lanseringer-tile i Sekretariatet

**Issue:** [#216](https://github.com/jdlarssen/golf-app/issues/216)
**Branch:** `claude/musing-northcutt-2382dd` (worktree)

## Problem

`/admin/lanseringer` ble shipped i [#202](https://github.com/jdlarssen/golf-app/issues/202), men det er ingen visuell vei dit fra Sekretariatet — admin må skrive URL-en manuelt. I praksis er funksjonen begravd. Tile-grid på `/admin` viser 4 fliser i dag (Spill / Spillere / Baner / Resultatprotokoll); vi trenger en 5. for Lanseringer slik at admin oppdager innboks-publiseringen.

## Research Findings

Ingen ekstern bibliotek-research nødvendig — endringen er ren intern wiring:

- `product_updates` (migrasjon `0035_product_updates.sql`) har en `select for authenticated using (true)`-policy. Admin kan lese direkte uten admin-client, og uten å bryte caching-mønsteret.
- Eksisterende `TilesGrid` i [app/admin/page.tsx:183–316](app/admin/page.tsx#L183-L316) fetcher allerede 6 parallelle counts via `Promise.all`. Å legge til en 7. query (last published) er konsistent med etablert mønster.
- Icon-systemet i [components/icons/Icons.tsx](components/icons/Icons.tsx) er 10 functional 24×24 line-icons, `currentColor`, 1.5 stroke, round caps/joins. SparkleIcon må følge samme kontrakt.

## Prior Decisions

- **`requireAdminOrTrustedCreator` (1.28.0, epic [#223](https://github.com/jdlarssen/golf-app/issues/223) Fase 4):** trusted-non-admin ser kun Baner-tile på `/admin`. Lanseringer er admin-only (publisering går via admin-flate), så ny tile MÅ ligge i admin-branchen av `tiles`-arrayet — ikke i `banerTile`-fellesnevneren.
- **Tile-arkitektur:** `TileIconKind` er en union-type med discrete strings, koblet til `TileIcon`-rendrer-funksjonen via switch. Utvidelse = ny string + ny case + ny import.
- **CHANGELOG/version-disiplin (CLAUDE.md):** bruker-synlig endring krever PATCH bump (tilgjengelighet-polish av eksisterende feature, ikke nytt feature-konsept) + CHANGELOG-tagline. Hooken i `.githooks/commit-msg` håndhever dette på `feat(...)`-prefiks.

## Design

### 1. Ny ikon — SparkleIcon

Lag `SparkleIcon` i [components/icons/Icons.tsx](components/icons/Icons.tsx) som SVG-versjon av `✨`-emojien som allerede er etablert i [components/products/ProductUpdateBannerClient.tsx:52](components/products/ProductUpdateBannerClient.tsx#L52) (banner) og [components/notifications/NotificationCard.tsx:29](components/notifications/NotificationCard.tsx#L29) (innboks). Visuell konsistens på tvers av flatene som handler om product updates.

Skisse — én stor stjerne med to mindre satelitt-stjerner (4-pointed «sparkle»-form, ikke 5-pointed pentagram), holdt innenfor 2px safe-zone:

```tsx
export const SparkleIcon = ({ size, ...rest }: IconProps) => (
  <svg {...base(size)} {...rest}>
    {/* sentral 4-pointed sparkle */}
    <path d="M 12 4 L 13.2 10.8 L 20 12 L 13.2 13.2 L 12 20 L 10.8 13.2 L 4 12 L 10.8 10.8 Z" />
    {/* mindre satellitter — øvre-høyre + nedre-venstre */}
    <path d="M 18 5 L 18.4 6.6 L 20 7 L 18.4 7.4 L 18 9 L 17.6 7.4 L 16 7 L 17.6 6.6 Z" />
    <path d="M 6 16 L 6.3 17.2 L 7.5 17.5 L 6.3 17.8 L 6 19 L 5.7 17.8 L 4.5 17.5 L 5.7 17.2 Z" />
  </svg>
);
```

Eksporter via [components/icons/index.ts](components/icons/index.ts) sammen med de andre Library-iconene.

### 2. Tile-grid utvidelse i [app/admin/page.tsx](app/admin/page.tsx)

**Endring 1 — utvide unionen:**

```ts
type TileIconKind = 'flagg' | 'konvolutt' | 'bane' | 'pokal' | 'sparkle';
```

**Endring 2 — ny query i `Promise.all`-blokken (linje ~195):**

```ts
supabase
  .from('product_updates')
  .select('created_at')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle(),
```

**Endring 3 — pluck resultatet:**

```ts
const lastPublishedAt = (lastPublishedRes.data as { created_at: string | null } | null)
  ?.created_at;
```

**Endring 4 — ny tile i admin-branchen (etter Resultatprotokoll, posisjon 5):**

```ts
{
  label: 'Lanseringer',
  href: '/admin/lanseringer',
  meta: lastPublishedAt
    ? `Sist publisert ${formatShortDateNb(lastPublishedAt)}`
    : 'Ingen publisert ennå',
  icon: 'sparkle',
},
```

**Endring 5 — `TileIcon`-switch:**

```tsx
if (kind === 'sparkle') return <SparkleIcon width={22} height={22} />;
```

**Endring 6 — `TilesSkeleton`:** øke fra 4 til 5 placeholders så skeleton ikke flickrer når 5. tile streamer inn.

### 3. Plassering på grid

Tile-grid er `grid-cols-2 gap-2.5`. Med 5 tiles blir det 2×2 + 1 ujevn flis i bunn (alene på venstre side). Issue-en aksepterer dette eksplisitt («Behold 4-tile-layout, legg Lanseringer som en 5. ujevn flis»). Hvis det viser seg å være visuelt rart i prod, opprett separat polish-issue — ikke gold-plating her.

### 4. Version + CHANGELOG

- `package.json`: `1.28.0` → `1.28.1` (PATCH — tilgjengelighet-polish av eksisterende feature).
- `CHANGELOG.md`: legg til oppføring under `1.28.y`-serie-headingen, med stakeholder-tagline + `<details>Teknisk</details>`. Tagline-eksempel: «Du kommer nå inn på Lanseringer fra Sekretariatet — flisen viser dato for siste publisering rett under.»

## Edge Cases & Guardrails

- **Ingen publiserte updates (fresh installasjon):** `lastPublishedAt = null` → meta viser «Ingen publisert ennå». Tile er fortsatt klikkbar (admin kan navigere inn og publisere første gang).
- **`product_updates`-SELECT feiler (RLS-quirk):** `maybeSingle()` returnerer `{ data: null }` — meta-en faller tilbake til «Ingen publisert ennå». Ingen krasj på admin-siden hvis denne enkelt-querien feiler.
- **Trusted-non-admin:** ser IKKE Lanseringer-tile (admin-only). Branch-betingelsen på `role.isAdmin` håndterer dette automatisk så lenge tile-en ligger i admin-branchen.
- **Datum-formattering:** Bruk `formatShortDateNb` (allerede importert) — konsistent med Resultatprotokoll-tile-en.
- **Cache:** Tile-grid er inne i `<Suspense fallback={<TilesSkeleton />}>`. Når `/admin/lanseringer` publiserer en ny update kalles `revalidateTag` eller `revalidatePath('/admin')` ikke automatisk fra publish-action. Det betyr at meta-en kan henge etter til neste request etter ny publisering. Ikke kritisk — admin venter ikke på live-update av denne meta-strengen.

## Key Decisions

- **Ny SparkleIcon (ikke gjenbruk):** Konvolutt-ikonet er allerede Spillere-flisen sitt; gjenbruk ville krasjet visuelt på samme grid. Ny SparkleIcon speiler ✨-emojien som er etablert i banner + notification-card → visuell-konseptuell kobling.
- **5. lonely tile, ikke grid-reorganisering:** Lanseringer er sjeldent-brukt admin-flate (1–2 publiseringer per uke). Aksepterer ujevn 5. rad framfor å re-tenke hele tile-hierarkiet. Reorganisering er separat polish-issue hvis det viser seg å være stygt i prod.
- **PATCH-bump, ikke MINOR:** Ny tile = tilgjengelighet-polish av eksisterende `/admin/lanseringer`-flate. Ingen ny capability, bare en lenke som tidligere måtte huskes.
- **`created_at`, ikke noe nytt `published_at`-felt:** `product_updates`-tabellen har kun `created_at`; lansering = opprettelse i dagens datamodell. Ingen migrasjon nødvendig.

**Claude's Discretion:**
- Eksakt SVG-path-koordinater for SparkleIcon (følg `base()`-helperen og 2px safe-zone, se andre icons for stilmal).
- Plassering av ny `Promise.all`-rad blant de eksisterende 6 (lesbarhet, ikke funksjonalitet).
- Hvor lansering-tile-en plasseres relativt til de andre i admin-arrayet (foreslår siste posisjon, men kan justeres hvis det gir bedre visuelt rytme).

## Success Criteria

- [ ] `SparkleIcon` finnes i [components/icons/Icons.tsx](components/icons/Icons.tsx) og er eksportert via [components/icons/index.ts](components/icons/index.ts). Verifiseres med `grep -n 'SparkleIcon' components/icons/Icons.tsx components/icons/index.ts`.
- [ ] `/admin` (for admin-rolle) viser 5 tiles, og 5. tile heter «Lanseringer». Verifiseres med Playwright eller manuell sjekk i prod-preview.
- [ ] Lanseringer-tile linker til `/admin/lanseringer`. Verifiseres med `grep -n "/admin/lanseringer" app/admin/page.tsx`.
- [ ] `meta`-tekst viser «Sist publisert {dato}» når minst én rad finnes i `product_updates`, ellers «Ingen publisert ennå». Verifiseres i kode: `grep -n "Sist publisert\|Ingen publisert ennå" app/admin/page.tsx`.
- [ ] `TileIconKind`-unionen inkluderer `'sparkle'` og `TileIcon`-switch håndterer den. Verifiseres med `grep -n "'sparkle'" app/admin/page.tsx` (begge: union + switch).
- [ ] `TilesSkeleton` renderer 5 placeholders (ikke 4). Verifiseres i kode.
- [ ] `package.json` versjon er `1.28.1` og `CHANGELOG.md` har ny oppføring med stakeholder-tagline under `1.28.y`-serien.
- [ ] Trusted-non-admin ser fortsatt KUN Baner-tile (regresjons-sjekk via kode: Lanseringer ligger i `role.isAdmin ? […] : [banerTile]`-branchen).

## Gates

- [ ] `npm run lint` passes
- [ ] `npm test` passes (vitest run — no new tests required, men ingen eksisterende skal brekke)
- [ ] `npm run build` passes (Next.js build inkluderer TypeScript-typecheck)
- [ ] Visuell sjekk: `/admin` viser 5 tiles, ny tile er klikkbar, meta-tekst ser fornuftig ut. Brukeren tester i prod; ingen lokal Playwright her.

## Files Likely Touched

- `components/icons/Icons.tsx` — ny `SparkleIcon`-export.
- `components/icons/index.ts` — re-export.
- `app/admin/page.tsx` — `TileIconKind`-union, `Promise.all`-utvidelse, ny tile, `TileIcon`-switch, `TilesSkeleton`-count.
- `package.json` — version 1.28.0 → 1.28.1.
- `CHANGELOG.md` — ny oppføring under 1.28.y.

## Out of Scope

- Badge-tall for «N nye uleste oppdateringer per måned» — overkill for sjelden admin-flate.
- Dynamisk meta som «N publiseringer denne måneden» — dato holder.
- Refactoring av tile-grid-layout til 3-kolonner eller 2×3 — separat polish-issue hvis det viser seg å være stygt.
- Cache-invalidering på `/admin` etter publisering av ny lansering — meta-en henger etter til neste naturlige request, akseptabelt for admin.
- Tester for selve tile-en (UI-glue; dekket av visuell sjekk + Next.js build-typecheck).
