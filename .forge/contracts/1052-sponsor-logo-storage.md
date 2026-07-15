# Spec: Sponsorlogo-opplasting på premiebordet — Storage-infra (#1052)

**Issue:** #1052 · oppfølging av premiebordet (#1039 del 2, kontrakt `1039-part2-sponsor-premiebord.md`)
**Type:** `feat` · area:leaderboard/storage → MINOR-bump + CHANGELOG Funksjon-rad
**Revidert:** 2026-07-15 mot dagens main (original 2026-07-10). Delta: migrasjonsnummer, `owner_id`-fix, empirisk policy-probe, to nye sponsor-flater (#1049), Zod-bakoverkompat, admin-klient i slett-opprydding, tre eier-beslutninger.

## Problem

Premiebordet (#1051) lar arrangøren skrive et **sponsornavn** som tekst per premie-slott; navnet vises på sponsor-stripa (tavle-flatene) og per premie-linje i premiebord-/premieutdelings-kortene. Arrangører vil vise sponsorens **logo**, ikke bare navnet. Dette blir appens FØRSTE bilde-opplastingsflate noensinne — verifisert greenfield 2026-07-15 på BÅDE staging og prod: 0 buckets, 0 policies på `storage.objects`, ingen `<input type="file">`, ingen `next/image`, ingen `images`-nøkkel i `next.config.ts`. Logo ble skilt ut som eget infra-løft ved bruker-vedtak 2026-07-05.

## Research Findings (in-repo + live DB, verifisert 2026-07-15)

- **Sponsor bor per premie-slott i jsonb:** `GamePrize` = `{ category, position, description, sponsor: string | null }` (`lib/games/prizes.ts:35-43`), persistert i `games.prizes jsonb NOT NULL DEFAULT '[]'` med CHECK `jsonb_typeof=array AND length<=7` (`0136_game_prizes.sql:32-34`). Logo = ny nøkkel på samme slott-element, ikke ny tabell.
- **games-RLS arves gratis:** `games`-UPDATE er arrangør-gated (0136:42-47) — ny jsonb-nøkkel arver dette.
- **FEM sponsor-visningsflater (to nye siden 2026-07-10, fra #1049-premieutdelingen):**
  1. `components/SponsorStrip.tsx` — tekst-stripe, montert på `spectate/[token]/page.tsx:114`, `embed/spill/[token]/page.tsx:84`, `games/[id]/leaderboard/page.tsx:177`.
  2. `components/PremiebordCard.tsx` — «Sponset av {navn}» per premie-linje (`PrizeLine`, :133-135); montert på spill-hjem (`games/[id]/(home)/page.tsx`), påmelding (`signup/[shortId]/page.tsx`) og offentlig landing (`PublicLandingView.tsx`).
  3. `components/PrizeAwardsCard.tsx` — «Sponset av {navn}» per utdelings-linje (`AwardLine`, :107-111); montert på avsluttet leaderboard (`leaderboardContent.tsx`).
- **Wizard-tråkling** (#1011-mønster): `PrizesSection.tsx:94-106` rendrer sponsor-`<input>` (kontrollert, uten `name`); `prizeFieldName(key,'desc'|'sponsor')` (`prizes.ts:156-161`) er delt navnekilde; `parsePrizesFromFormData` (`gamePayload.ts:339`) leser feltene. Logo trenger tredje feltnavn (`prize_{key}_logo`) + `PrizeDraft`-utvidelse (`prizes.ts:164-190`).
- **Ingen cache-key-bump:** `getGameWithPlayers` ble bumpet til `'gwp6'` da `prizes` kom inn i select-en (#1051, `getGameWithPlayers.ts:251-258`). Logo-path rir inne i samme jsonb-verdi — stale entries mangler bare logoen til revalidate, ingen ny bump.
- **Slett-flyten** (`admin/games/[id]/slett/actions.ts`, `deleteGame`) har ingen storage-opprydding i dag → må legges til. NB: admin kan slette ANDRES spill; da eier ikke admin objektene, så opprydding må gå via service-role-klienten (`getAdminClient`), ikke bruker-klienten.
- **Storage-skjema-eierskap (2025-innstramming), empirisk avklart:** `storage.objects`/`storage.buckets` eies av `supabase_storage_admin`; `postgres` er IKKE medlem. LIKEVEL: rollback-vernet probe på staging 2026-07-15 beviste at `postgres` kan `insert into storage.buckets` OG `create policy on storage.objects` (policy_created=1, bucket_created=1 i transaksjon; 0 rester etter rollback). Migrasjonsveien holder — ikke re-verifiser. Fallback hvis prod mot formodning nekter: policies via Dashboard (dokumentér i closing-kommentar).
- **`owner`-kolonnen er DEPRECATED** (Supabase docs «Ownership», verifisert via search_docs): bruk `owner_id` (text) — `owner_id = (select auth.uid()::text)`.
- **Docs-anbefaling:** storage-skjemaet behandles som read-only via SQL; objekt-operasjoner (upload/remove) går ALLTID via API-et, aldri SQL-DML på `storage.objects`.
- **Next 16 images (bundlede docs, `node_modules/next/dist/docs`):** `remotePatterns`-shape bekreftet (`{protocol, hostname, port, pathname, search}`); breaking i v16: `images.qualities` default `[75]`, `minimumCacheTTL` default 4t — begge OK for logoer.

## Prior Decisions (carry-forward)

- **#1039 del 2:** sponsor = tekst i v1; logo eksplisitt utsatt hit. jsonb-på-`games` framfor barnebord (RLS-arv + cache-gratis + atomisk skriv) — samme begrunnelse gjelder logo-path.
- **#1024 embed-CSP:** kun `frame-ancestors` settes — ingen `img-src` finnes, bilder lastes fritt CSP-messig på alle flater inkl. embed.
- **5 feller:** live DB fasit (trap 1); 0-rad-skriv = feil (trap 2); RLS er authz-laget (trap 3, hostile-rig `e2e/games/adversarial-role-replay.spec.ts`); regel-én-hjem for opplastings-taket (trap 4); opplasting-så-publiser er ingen fler-stegs-insert (trap 5).
- **Skjema/bucket-endring:** staging FØRST via MCP, verifiser, deretter prod etter eier-godkjenning (0107-mønsteret + prod-brannmur #1074).

## Design

### Storage (migrasjon 0143 — 0141/0142 er tatt; renumber mot origin/main ved bygging)
`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)` → bucket `sponsor-logos`, **public = true**, `file_size_limit` ≈ 1 MB, `allowed_mime_types = {image/png,image/jpeg,image/webp}` (kun raster-output — SVG lagres ALDRI, se opplasting). Policies på `storage.objects`:
- **INSERT** `to authenticated with check (bucket_id='sponsor-logos' AND (storage.foldername(name))[1] = (select auth.uid()::text))` — mappe-per-eier.
- **DELETE** `to authenticated using (bucket_id='sponsor-logos' AND owner_id = (select auth.uid()::text))` — «Fjern»/re-opplasting fra klient.
- **Ingen UPDATE-policy** (opplasting bruker unike uuid-navn, aldri upsert) og **ingen SELECT-policy** (public bucket serverer lesing via CDN).

### Datamodell
Utvid `GamePrize` med `sponsorLogoPath: string | null` (storage-object-key, ikke full URL). **Zod: feltet MÅ være optional-med-default-null i parse** — eksisterende `prizes`-blobs i DB mangler nøkkelen, og et påkrevd felt ville fått `safeParsePrizes` til å returnere `[]` og VISKE UT premiebordet på alle eksisterende spill. Test mot en literal legacy-fikstur uten nøkkelen. Skrivestien serialiserer alltid nøkkelen eksplisitt.

### Opplasting (wizard premiebord-seksjon)
`PrizesSection.tsx`: per slott, ved siden av sponsor-tekstfeltet, en filvelger som viser thumbnail + «Fjern». Ved valg: dekod klient-side (**SVG godtas som INPUT** — dekodes via `<img>`/blob-URL og rasteriseres; dimensjonsløse SVG-er får fallback-bredde) → `<canvas>`-nedskalering (maks ~400px lengste kant) → re-encode webp (png-fallback der `toBlob('image/webp')` ikke støttes, f.eks. Safari) → last opp via authed supabase-js `storage.from('sponsor-logos').upload("{auth.uid}/{crypto.randomUUID}.{ext}", blob)` → path i `prizeDraft`-state → skjult `prize_{key}_logo`-input (#1011) → `parsePrizesFromFormData` → `games.prizes`-jsonb i samme INSERT/UPDATE. Rå-fil > 5 MB avvises klient-side før dekoding (vennlig norsk feil); bucketens `file_size_limit` er server-sannheten.

### Visning (eier-beslutning 2026-07-15: ALLE sponsor-flater)
- **Slott med logo viser KUN logo** (sponsornavnet = alt-tekst; mangler navn → generisk norsk alt). Slott med bare navn beholder dagens tekst. Ingen logo lastet opp → ingenting endres.
- **`SponsorStrip`:** logo-bevisst — distinkte logoer (dedup på path) rendres som bilder; navn-only-sponsorer beholder tekst-oppramsingen; blandet stripe viser begge deler.
- **`PremiebordCard` (`PrizeLine`) + `PrizeAwardsCard` (`AwardLine`):** linjer med `sponsorLogoPath` viser en liten logo (diskret inline-høyde) i stedet for «Sponset av {navn}»-teksten; navn-only beholder teksten.
- `next/image` med fast maks-høyde; `next.config.ts` får `images.remotePatterns` for `*.supabase.co` path `/storage/v1/object/public/**` (dekker prod + staging).

### Opprydding
`deleteGame` (`slett/actions.ts`): itererer `prizes[].sponsorLogoPath` og `storage.remove()` **via `getAdminClient()`** (admin sletter andres spill → eier ikke objektene; service-role bypasser RLS). Best-effort: `Promise.allSettled` + `console.error` (Resend-mønsteret; feil blokkerer ikke slett). «Fjern»/re-opplasting i wizard fjerner forrige object best-effort fra klienten (DELETE-policyen dekker eieren; admin-som-redigerer-andres feiler stille → akseptert orphan).

### i18n + copy
Alle nye strenger nb+en (next-intl, `messages/no.json`+`en.json`). Ny norsk copy (filvelger-label, hjelpetekst, feilmeldinger, «Fjern», alt-tekster) gjennom `humanizer` før commit.

## Edge Cases & Guardrails

- **Legacy-blob-kompat (KRITISK):** prizes-jsonb uten `sponsorLogoPath`-nøkkel MÅ parse OK (optional/default) — ellers forsvinner premiebordet på alle eksisterende spill. Unit-test med legacy-fikstur.
- **Ingen gameId ved opprett:** wizardens INSERT er atomisk; path bruker `{auth.uid}/…`, ikke `{gameId}/…`.
- **Orphan-on-abandon:** opplastet logo + forlatt wizard = foreldreløst object (VERIFICATION GAP — I3). Akseptert restrisiko i v1 (små bilder); opprydding-routine er Out of Scope.
- **SVG-input:** rasteriseres alltid — SVG-bytes når aldri bucketen (`allowed_mime_types` har ikke image/svg+xml). Dimensjonsløs SVG → fallback-bredde før canvas. Dekode-feil → vennlig norsk feilmelding.
- **Safari:** `canvas.toBlob('image/webp')` kan falle tilbake til png — filendelse må følge faktisk blob-type.
- **Logo uten sponsornavn:** tillatt — logoen står alene (generisk alt-tekst).
- **Matchplay/pruning:** logo-path beskjæres med slottet i `prunePrizes` — ingen endring der (feltet rir på slottet).
- **Hostile opplasting (#440):** anon-upload avvist (ingen anon-INSERT-policy); authed mot fremmed mappe avvist (foldername-check); feil mime avvist (`allowed_mime_types`); oversize avvist (`file_size_limit`); public GET lykkes anon. Verifiseres med storage-hostile e2e mot staging (speil `e2e/games/adversarial-role-replay.spec.ts`).
- **Free-tier storage** (1 GB) rikelig — noter, ikke gate.

## Key Decisions

- **Offentlig bucket, IKKE signerte URL-er:** anon-flater (spectate/embed/leaderboard) + CDN-caching.
- **Path `{auth.uid}/{uuid}.{ext}`, IKKE `{gameId}/…`:** gameId finnes ikke under atomisk opprett (trap 5); eier-mappe tilfredsstiller INSERT-RLS i begge flyter.
- **Logo-path i `games.prizes`-jsonb:** RLS-arv + cache-gratis + atomisk skriv (samme som #1039 del 2).
- **Klient-side nedskalering, IKKE server-side:** ingen `sharp` på serverless; lite objekt; rå-tak (5 MB) er UX-guard, bucket-limit er authz-sannheten.
- **Eier-beslutning 2026-07-15 — alle sponsor-flater:** logo vises på SponsorStrip + PremiebordCard + PrizeAwardsCard; uten logo vises ingenting nytt.
- **Eier-beslutning 2026-07-15 — SVG som input:** godtas og rasteriseres til webp/png ved opplasting; lagres aldri som SVG.
- **Eier-beslutning 2026-07-15 — kun logo når slottet har begge:** navnet blir alt-tekst.
- **`owner_id`, ikke `owner`:** deprecated kolonne unngås; policies bruker `(select auth.uid()::text)`-formen.
- **INSERT + DELETE-policies only:** ingen upsert i flyten → ingen UPDATE-policy; mindre flate å resonnere om.
- **Slett-opprydding via `getAdminClient()`:** admin-slett av andres spill må kunne rydde objekter admin ikke eier.

**Claude's Discretion:**
- Eksakt `file_size_limit` (≈0,5–1 MB), maks nedskalerings-dimensjon, webp/png-valg per browser-støtte.
- `next/image` `unoptimized` eller ikke (Vercel Hobby-kvote vs. allerede-liten blob; husk v16 `qualities`-default `[75]`).
- Thumbnail-/«Fjern»-layout i wizard-slottet; logo-størrelse/wrap på stripa og i kort-linjene.
- Zod-validering av path-shape (maks-lengde/mønster) — så lenge legacy-kompat holder.
- SVG-fallback-bredde ved dimensjonsløs input.

## Success Criteria

1. Migrasjon 0143 oppretter public bucket `sponsor-logos` (file_size_limit + allowed_mime_types) + INSERT/DELETE-policies på `storage.objects` med `owner_id`-formen; **påført staging + verifisert** (bucket finnes, policies aktive).
2. Arrangør kan velge sponsorlogo per premie-slott i opprett OG rediger; SVG-input rasteriseres; fila nedskaleres og lastes opp; path persisteres i `games.prizes` (unit: parse av `prize_{key}_logo`; staging-klikkrunde).
3. Logo vises på ALLE fem sponsor-flater: SponsorStrip (leaderboard + spectate + embed) som bilde-stripe, og per premie-linje i PremiebordCard (spill-hjem/påmelding/landing) + PrizeAwardsCard (avsluttet tavle); navn-only-slott beholder tekst; `next/image` laster uten pattern-feil (`remotePatterns` i `next.config.ts`).
4. **Legacy-kompat:** prizes-blob UTEN `sponsorLogoPath`-nøkkel parser til gyldige slott (unit-test med legacy-fikstur) — premiebordet på eksisterende spill er uendret.
5. **Hostile-opplasting** (staging, #440-rig): anon-upload avvist; fremmed-mappe avvist; feil mime avvist; oversize avvist; public GET OK.
6. `deleteGame` fjerner slottenes logo-objects best-effort via admin-klient (VERIFICATION GAP notert til første ekte slett).
7. Bruker-synlig → staging-klikkrunde av opplasting + alle visningsflater FØR merge (staging-verified-label på PR-en).

## Gates

- `npx tsc --noEmit` grønn · `npm run lint` grønn på berørte filer · `npm run build` grønt (`next/image` + remotePatterns + cacheComponents-fella).
- `npx vitest run` co-located grønt (`prizes` Zod inkl. legacy-fikstur + `gamePayload`-parse; maks én render-test per berørt komponent — SponsorStrip/PremiebordCard/PrizeAwardsCard har render-tester fra før, utvid framfor å duplisere).
- Storage-hostile e2e (`@gate`/`@lifecycle`) grønn mot staging.
- Bilingual nb+en; `catalogParity`+`apostropheParity` grønne; ny copy humanizer-vasket.
- **DB/bucket:** staging påført + verifisert; **prod pre-merge** krever eier-godkjenning (prod-brannmur #1074, `touch .claude/approve-prod`).
- `feat` → MINOR-bump + én CHANGELOG Funksjon-linje.

## Files Likely Touched

- `supabase/migrations/0143_sponsor_logos_bucket.sql` — bucket + storage.objects-policies (renumber ved drift)
- `lib/games/prizes.ts` (+ test) — `sponsorLogoPath` + Zod (optional/default) + `prizeFieldName('logo')` + `PrizeDraft`
- `lib/games/gamePayload.ts` (+ test) — parse `prize_{key}_logo`
- `lib/storage/sponsorLogos.ts` (ny) — klient-helper: dekode (inkl. SVG), nedskalere, upload/remove
- `app/[locale]/admin/games/new/sections/PrizesSection.tsx` — filvelger + thumbnail + «Fjern»
- `app/[locale]/admin/games/new/useGameFormState.ts` + `GameWizard.tsx` (+ `GameForm.tsx`) — logo-state + skjult input
- `components/SponsorStrip.tsx` — logo-bevisst stripe
- `components/PremiebordCard.tsx` + `components/PrizeAwardsCard.tsx` — logo i premie-linjer
- `next.config.ts` — `images.remotePatterns`
- `app/[locale]/admin/games/[id]/slett/actions.ts` — best-effort storage-opprydding (admin-klient)
- `e2e/**/sponsor-logo-hostile.spec.ts` — #440-hostile-opplasting
- `messages/no.json` + `en.json`, `CHANGELOG.md`, `package.json`

## Out of Scope

- Liga-/cup-sponsorlogoer og `/embed/liga`-flaten (premier er per spill).
- Planlagt opprydding-routine for orphan-objekter (akseptert restrisiko i v1).
- Sponsor-logo i share-image/rundereferat (#1008-flatene).
- `img-src`-CSP-herding (ingen `img-src` finnes i dag; egen sikkerhets-runde hvis ønsket).
- Flere logoer per slott, lenke-til-sponsor, logo-CDN-transform utover next/image.
