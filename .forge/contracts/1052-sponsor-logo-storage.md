# Spec: Sponsorlogo-opplasting på premiebordet — Storage-infra (#1052)

**Issue:** #1052 · oppfølging av premiebordet (#1039 del 2, kontrakt `1039-part2-sponsor-premiebord.md`)
**Type:** `feat` · area:leaderboard/storage → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Premiebordet (#1051) lar arrangøren skrive et **sponsornavn** som tekst per premie-slott; `SponsorStrip` viser «Premier sponset av {A} og {B}» på tavle-flatene. Arrangører vil vise sponsorens **logo**, ikke bare navnet. Dette blir appens FØRSTE bilde-opplastingsflate noensinne — verifisert greenfield: ingen Supabase Storage-bucket (0 treff i 141 migrasjoner; `supabase/config.toml:9` utelater storage bevisst), ingen `<input type="file">`, ingen `next/image`, ingen `remotePatterns` i `next.config.ts` (hele fila lest — kun `headers()`/`redirects()`, ingen `images`-nøkkel). Logo ble skilt ut som eget infra-løft ved bruker-vedtak 2026-07-05.

## Research Findings (in-repo ground truth, verifisert denne økten)

- **Sponsor bor per premie-slott i jsonb:** `GamePrize` = `{ category, position, description, sponsor: string | null }` (`lib/games/prizes.ts:35-43`), persistert i `games.prizes jsonb NOT NULL DEFAULT '[]'` med CHECK `jsonb_typeof=array AND length<=7` (`supabase/migrations/0136_game_prizes.sql:32-34`). Logo hører naturlig på samme slott → utvid elementet, ikke ny tabell.
- **games-RLS arves gratis:** `games`-UPDATE er allerede arrangør-gated («games creator update» = `created_by=auth.uid()`, «games admin update» = `is_admin()`, `0136:42-47`) — en ny jsonb-nøkkel arver dette, ingen ny games-policy.
- **SponsorStrip** (`components/SponsorStrip.tsx`, tekst-only i dag) er montert på nøyaktig tre flater: `app/[locale]/spectate/[token]/page.tsx:114`, `app/[locale]/embed/spill/[token]/page.tsx:84`, `app/[locale]/games/[id]/leaderboard/page.tsx:177` — alle via `safeParsePrizes(game.prizes)`. Ett komponent-hjem → logo-visning legges her.
- **Wizard-tråkling** (#1011-mønster): `PrizesSection.tsx:94-106` rendrer sponsor-`<input>` (kontrollert, uten `name`); serialisering eies av alltid-montert forelder → `parsePrizesFromFormData` (`lib/games/gamePayload.ts:339-362`) leser `prizeFieldName(key,'desc'|'sponsor')`. Logo trenger et tredje felt per slott (`prize_{key}_logo`).
- **Prizes flyter allerede til alle flater:** `getGameWithPlayers.ts:202` (+ cache-key-bump-note `:252-254`), `getGameByShortId.ts:65`, `editGameInitialValues.ts:204`. Logo-path følger med gratis siden den bor i samme jsonb.
- **Slett-flyten** (`app/[locale]/admin/games/[id]/slett/actions.ts`, `deleteGame`) sletter kun games-raden (FK CASCADE tar barn) og har **ingen** storage-opprydding i dag → må legges til.
- **Supabase Storage (docs, verifisert via search_docs):** offentlig bucket bypasser RLS på *lesing* (CDN-cachet, mer performant) men *opplasting* krever alltid en INSERT-policy på `storage.objects`; opplastings-grenser (`file_size_limit`, `allowed_mime_types`) settes på bucket-nivå; mappe-per-eier-mønster: `with check (bucket_id=… AND (storage.foldername(name))[1] = auth.uid()::text)`; Free-tier global tak 50 MB.

## Prior Decisions (carry-forward)

- **#1039 del 2:** sponsor = tekst i v1; logo eksplisitt utsatt til dette issuet (`1039-part2...md` Out of Scope). jsonb-på-`games` framfor barnebord (RLS-arv + cache-gratis + atomisk skriv) — samme begrunnelse gjelder logo-path.
- **#1024 embed-CSP:** `next.config.ts headers()` setter KUN `Content-Security-Policy: frame-ancestors` — det finnes **ingen `img-src`-direktiv** i appen, så bilder lastes fritt CSP-messig på alle flater inkl. embed. (Hvis en framtidig CSP-herding legger til `img-src`, MÅ storage-verten allowlistes der.)
- **5 feller:** live DB fasit (trap 1); 0-rad-skriv = feil (trap 2, `expectAffected`); RLS er authz-laget (trap 3, hostile-PATCH-rig #440); regel-én-hjem for opplastings-taket (trap 4); opplasting-så-publiser er ingen fler-stegs-insert (trap 5) — se Key Decisions.
- **Skjema/bucket-endring:** staging FØRST via MCP, verifiser, deretter prod etter eier-godkjenning (0107-mønsteret + prod-brannmur #1074).

## Design

### Storage (migrasjon 0141)
`insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)` → bucket `sponsor-logos`, **public = true**, `file_size_limit` ≈ 1 MB, `allowed_mime_types = {image/png,image/jpeg,image/webp}` (**SVG ekskludert** — XSS-risk, lar seg ikke canvas-nedskalere). Policies på `storage.objects`:
- **INSERT** `to authenticated with check (bucket_id='sponsor-logos' AND (storage.foldername(name))[1] = auth.uid()::text)` — mappe-per-eier.
- **UPDATE + DELETE** `to authenticated using (bucket_id='sponsor-logos' AND owner = auth.uid())` — re-opplasting/opprydding.
- **SELECT:** ingen (public bucket serverer lesing offentlig via CDN).

### Datamodell
Utvid `GamePrize` (`lib/games/prizes.ts`) med `sponsorLogoPath: string | null` (storage-object-key, ikke full URL). Zod-skjemaet får feltet (nullable string). Rir på `games.prizes` jsonb — ingen ny kolonne, ingen `gen:types`-bump (jsonb). Regel-én-hjem: logo-path valideres samme sted som `sponsor`.

### Opplasting (wizard premiebord-seksjon)
`PrizesSection.tsx`: per slott, ved siden av sponsor-tekstfeltet, en filvelger som viser thumbnail + «Fjern». Ved valg: **klient-side nedskalering** (`<canvas>`, maks ~400px lengste kant, re-encode webp/png) → last opp den lille bloben umiddelbart via authed supabase-js `storage.from('sponsor-logos').upload("{auth.uid}/{crypto.randomUUID}.webp", blob)` → lagre returnert path i `prizeDraft`-state → serialisert som skjult `prize_{key}_logo`-input (#1011) → parses i `gamePayload.ts` → skrives i `games.prizes`-jsonb i samme INSERT/UPDATE. Rå-fil > 5 MB avvises klient-side før nedskalering (vennlig norsk feil); bucketens `file_size_limit` er server-sannheten.

### Visning
`SponsorStrip` blir logo-bevisst: slott med `sponsorLogoPath` rendres som logo (`next/image`, fast maks-høyde, `tabular`-fri), navn-only-sponsorer beholder tekst-oppramsingen. `next.config.ts` får `images.remotePatterns` for `*.supabase.co` path `/storage/v1/object/public/**` (dekker prod- + staging-ref). Ett komponent-hjem dekker alle tre flater.

### Opprydding
`deleteGame` (`slett/actions.ts`): før/etter games-slett, itererer `prizes[].sponsorLogoPath` og `storage.remove()` (best-effort, `Promise.allSettled` + `console.error` — samme mønster som Resend-helperne; feil blokkerer ikke slett). Re-opplasting/fjerning i edit fjerner forrige object best-effort.

### i18n + copy
Alle nye strenger nb+en (next-intl, `messages/no.json`+`en.json`). Ny norsk copy (filvelger-label, hjelpetekst, feilmeldinger, «Fjern») gjennom `humanizer` før commit.

## Edge Cases & Guardrails

- **Ingen gameId ved opprett:** wizardens INSERT skjer atomisk; gameId finnes ikke når fila velges → path bruker `{auth.uid}/…`, ikke `{gameId}/…` (se Key Decisions).
- **Orphan-on-abandon:** opplastet logo + forlatt wizard uten publisering = foreldreløst object (VERIFICATION GAP for opprydding — I3). Aksepteres som lav kost (små bilder); en planlagt opprydding-routine er mulig senere (Out of Scope).
- **SVG/animert:** avvist av `allowed_mime_types` (server) + klient-mime-sjekk (UX).
- **Logo uten sponsornavn:** tillatt — logoen står alene på stripa. Navn uten logo = dagens tekst-oppførsel.
- **Matchplay/pruning:** logo-path beskjæres sammen med slottet i `prunePrizes` (dropp placement for matchplay) — ingen foreldreløs path i jsonb.
- **Hostile opplasting (#440):** anon-upload avvist (ingen INSERT-policy for anon); authed bruker mot fremmed mappe avvist (foldername-check); feil mime avvist (`allowed_mime_types`); oversize avvist (`file_size_limit`); public GET lykkes anon. Verifiseres med storage-hostile e2e-spec (staging, speil `adversarial-role-replay.spec.ts`).
- **Free-tier storage** (1 GB) rikelig for små logoer — noter, ikke gate.

## Key Decisions

- **Offentlig bucket, IKKE signerte URL-er:** logoene vises på anon-flater (spectate/embed/leaderboard); signerte URL-er ville krevd server-side signering på hver anon-render og drept CDN-cachingen. Public read = CDN-cachet + enklest.
- **Path `{auth.uid}/{uuid}.webp`, IKKE `{gameId}/…`:** gameId finnes ikke under den atomiske opprett-INSERT-en; å bruke den ville tvunget to-stegs opprett (upload→id→update) og brutt atomisk skriv (trap 5). Eier-mappe tilfredsstiller INSERT-RLS og virker i begge flyter.
- **Logo-path i `games.prizes`-jsonb, ny felt på `GamePrize`:** RLS-arv + cache-gratis + atomisk skriv — samme begrunnelse som #1039 del 2 valgte jsonb.
- **Klient-side nedskalering, IKKE server-side:** unngår tung `sharp` på Vercel-serverless; holder objektet lite; ingen server-round-trip. Rå-tak (5 MB) er UX-guard, bucket-`file_size_limit` er authz-sannheten.
- **Ett `SponsorStrip`-hjem, logo-bevisst** — ikke ny komponent per flate (#598-mønster).

**Claude's Discretion:**
- Eksakt `file_size_limit` (≈0,5–1 MB), maks nedskalerings-dimensjon, output-format (webp vs png-fallback).
- Om `next/image` brukes med `unoptimized` (spar Vercel Hobby-optimaliseringskvote siden bloben alt er liten) eller optimalisert.
- Thumbnail-/«Fjern»-UI-layout i premiebord-slottet; logo-stripe-layout (høyde, wrap) på tavla.
- Om storage-`remove` også kjøres ved re-opplasting i edit eller kun ved slett.

## Success Criteria

1. Migrasjon 0141 oppretter public bucket `sponsor-logos` (file_size_limit + allowed_mime_types) + INSERT/UPDATE/DELETE-policies på `storage.objects`; **påført staging + verifisert** (bucket finnes, policies aktive).
2. Arrangør kan velge en sponsorlogo per premie-slott i opprett OG rediger; fila nedskaleres klient-side og lastes opp; path persisteres i `games.prizes` (unit: parse av `prize_{key}_logo`; staging-klikkrunde).
3. `SponsorStrip` viser logoen på in-app leaderboard + `/spectate` + `/embed/spill`; navn-only-sponsorer beholder tekst; komponenten returnerer null uten sponsor/logo.
4. `next.config.ts` har `images.remotePatterns` for Supabase Storage public-path; `next/image` lastes uten CSP-/pattern-feil.
5. **Hostile-opplasting** (staging, #440-rig): anon-upload = avvist; fremmed-mappe-upload = avvist; feil mime = avvist; oversize = avvist; public GET = OK.
6. `deleteGame` fjerner slottenes logo-objects best-effort (VERIFICATION GAP notert til første ekte slett).
7. Bruker-synlig → staging-klikkrunde av premiebord-opplasting + tavle-visning FØR merge.

## Gates

- `npx tsc --noEmit` grønn · `npm run lint` grønn på berørte filer.
- `npx vitest run` co-located for endrede filer grønt (`prizes` Zod + `gamePayload`-parse av logo-felt; maks én render-test for logo-`SponsorStrip`).
- `npm run build` grønt (`next/image` + remotePatterns + cacheComponents-fella).
- Storage-hostile e2e (`@gate`/`@lifecycle`) grønn mot staging.
- Bilingual nb+en; `catalogParity`+`apostropheParity` grønne; ny copy humanizer-vasket.
- **DB/bucket:** staging påført + verifisert; **prod pre-merge** krever eier-godkjenning (prod-brannmur #1074, `touch .claude/approve-prod`).
- `feat` → MINOR-bump + én CHANGELOG Funksjon-linje.

## Files Likely Touched

- `supabase/migrations/0141_sponsor_logos_bucket.sql` — bucket + storage.objects-policies
- `lib/games/prizes.ts` (+ test) — `sponsorLogoPath` på `GamePrize` + Zod + slott-felt
- `lib/games/gamePayload.ts` — parse `prize_{key}_logo`
- `app/[locale]/admin/games/new/sections/PrizesSection.tsx` — filvelger + klient-nedskalering + upload
- `app/[locale]/admin/games/new/useGameFormState.ts` + `GameWizard.tsx` (+ `GameForm.tsx`) — logo-state + skjult input
- `components/SponsorStrip.tsx` — logo-bevisst rendering
- `next.config.ts` — `images.remotePatterns`
- `app/[locale]/admin/games/[id]/slett/actions.ts` — best-effort storage-opprydding
- `lib/storage/sponsorLogos.ts` (ny) — upload/remove-helper + nedskalering (evt.)
- `e2e/**/sponsor-logo-hostile.spec.ts` — #440-hostile-opplasting
- `messages/no.json` + `en.json`, `CHANGELOG.md`, `package.json`

## Out of Scope

- Liga-/cup-sponsorlogoer og `/embed/liga`-flaten (premier er per spill).
- Planlagt opprydding-routine for orphan-objekter (aksepter restrisiko i v1).
- Sponsor-logo i share-image/rundereferat (#1008-flatene).
- `img-src`-CSP-herding (ingen `img-src` finnes i dag; egen sikkerhets-runde hvis ønsket).
- Flere logoer per slott, lenke-til-sponsor, logo-CDN-transform utover next/image.
