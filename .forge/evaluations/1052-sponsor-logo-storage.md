# Evaluering: Sponsorlogo-opplasting på premiebordet (#1052)

**Kontrakt:** `.forge/contracts/1052-sponsor-logo-storage.md`
**PR:** #1250 (OPEN, ikke draft, `staging-verified`-label)
**Evaluert:** 2026-07-15 · fresh-context skeptisk evaluator
**Branch:** `claude/contract-1052-logo-storage-4163a5` (9 commits over origin/main)

---

## Gate-kjøring (kjørt selv, Node 22, fra worktree-rota)

| Gate | Resultat | Bevis |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | exit 0, 0 output-linjer |
| `npx eslint <berørte filer>` | ✅ PASS | exit 0, ingen funn |
| `npx vitest run <co-located>` | ✅ PASS | 8 filer, 69 tester grønne (1.01s) |
| `npm run build` | ✅ PASS | exit 0, PPR-skall intakt, ingen cacheComponents-/next-image-feil |
| Hostile e2e mot staging | ✅ PASS | `sponsor-logo-hostile.spec.ts` 5/5 (4.5s), kjørt selv |

Vitest-dekning: `prizes.test.ts`, `gamePayload.prizes.test.ts`, `prizeAwards.test.ts`, `lib/storage/fitWithin.test.ts`, `SponsorStrip.test.tsx`, `slett/actions.test.ts`, `catalogParity.test.ts`, `apostropheParity.test.ts`.

---

## Per-kriterium

### Kriterium 1 — Migrasjon 0143: bucket + policies, påført + verifisert på staging → **PASS**

Read-only SELECT mot staging (`snwmueecmfqqdurxedxv`):
```
id=sponsor-logos, public=true, file_size_limit=1048576,
allowed_mime_types=[image/png,image/jpeg,image/webp], pol=2
```
Policy-detaljer (`pg_policies`, storage.objects) matcher kontrakten eksakt:
- INSERT `to authenticated` with_check `(bucket_id='sponsor-logos' AND (storage.foldername(name))[1] = (select auth.uid()::text))`
- DELETE `to authenticated` using `(bucket_id='sponsor-logos' AND owner_id = (select auth.uid()::text))`

`owner_id`-formen brukt (ikke deprecated `owner`); ingen UPDATE/SELECT-policy. `0143_sponsor_logos_bucket.sql:30-52` er identisk med det staging viser. Prod-migrasjonen er bevisst utsatt til eier-godkjenning før merge (kjent avgrensning, ikke funn).

### Kriterium 2 — Opplasting i opprett OG rediger, SVG rasteriseres, path persisteres → **PASS**

- Klient-pipeline `lib/storage/sponsorLogos.ts`: decode (SVG inkludert) → `fitWithin` (400px) → canvas → webp m/ png-fallback → `storage.upload({uid}/{uuid}.{ext})`. `fitWithin` unit-testet inkl. dimensjonsløs-SVG-kvadrat-fallback.
- Wizard `PrizesSection.tsx` `SponsorLogoField`: umiddelbar opplasting, thumbnail + «Fjern», typede norske feil. Kun object-path går inn i `prizeDraft`.
- Skjult `prize_{key}_logo`-input montert i BÅDE `GameWizard.tsx` (opprett) og `GameForm.tsx` (rediger).
- `parsePrizesFromFormData` (`gamePayload.ts:340`) leser feltet; `prizes` skrives til DB i `new/actions.ts:230` (insert) og `edit/actions.ts:208` (update).
- Unit: `gamePayload.prizes.test.ts` dekker path-parse, whitespace→null, over-lang→null, logo-på-tom-slott ignoreres.
- Staging-klikkrunde (PR-bevis) verifiserte edit-flyten E2E: `games.prizes[0].sponsorLogoPath` satt, SVG→webp 2296 bytes. Opprett-wizarden ikke klikket live, men delt komponent + serialisering + unit-dekket (kjent avgrensning).

### Kriterium 3 — Logo på alle fem sponsor-flater; navn-only beholder tekst; next/image uten pattern-feil → **PASS**

Mount-punkter bekreftet (grep, alle får full `prizes`/`safeParsePrizes(game.prizes)`):
- SponsorStrip: `leaderboard/page.tsx:177`, `spectate/[token]/page.tsx:114`, `embed/spill/[token]/page.tsx:84`
- PremiebordCard: `games/[id]/(home)/page.tsx:580,962`, `signup/[shortId]/page.tsx:358`, `PublicLandingView.tsx:87`
- PrizeAwardsCard: `leaderboardContent.tsx:180`

`SponsorStrip.tsx` dedupliserer på path, bruker navn som alt, holder navn-only i tekstlinja og gjentar ikke et navn som alt står med logo (render-test låser regelen). `SponsorCredit.tsx` er delt atom for begge kort. `next.config.ts:30-37` har `remotePatterns` for `*.supabase.co` `/storage/v1/object/public/**`. Staging-bevis viser bildene rendret på leaderboard + premiebord-card.

### Kriterium 4 — Legacy-kompat: prizes-blob uten nøkkel parser → **PASS**

`prizes.ts:61-67`: `sponsorLogoPath` er `.nullable().default(null)`. `prizes.test.ts:132-149` bruker en literal pre-#1052-blob uten nøkkelen, asserterer `parsePrizes`/`safeParsePrizes` gir gyldig slott med `sponsorLogoPath=null`. tsc-grønt beviser dessuten at ALLE `GamePrize`-konstruksjonssteder i kildekoden ble oppdatert (feltet er påkrevd i typen).

### Kriterium 5 — Hostile-opplasting (staging, #440-rig) → **PASS**

Kjørt selv: `sponsor-logo-hostile.spec.ts` 5/5 grønn mot staging:
anon-upload avvist · fremmed mappe avvist · svg-mime avvist · oversize (>1 MB) avvist · egen mappe png OK + public GET 200 anon. Spec rydder testobjektet via service-role.

### Kriterium 6 — deleteGame rydder logo-objects best-effort via admin-klient → **PASS**

`slett/actions.ts:72-92`: `safeParsePrizes(game.prizes)` (fanget FØR delete) → `getAdminClient().storage.from(...).remove(logoPaths)` kun når `logoPaths.length>0`, `getAdminClient()` inne i try/catch, feil logges og blokkerer aldri (Resend-mønster). Unit `slett/actions.test.ts:107-156` asserterer remove kalt med begge paths + no-logo-guard. Staging-bevis: public GET → 400 etter slett (VERIFICATION GAP lukket LIVE).

### Kriterium 7 — Bruker-synlig → staging-klikkrunde + label før merge → **PASS**

PR #1250 har `staging-verified`-label og eier-bevis-kommentar (2026-07-15) med full sekvens: opplasting, DB-bevis, SVG, visning (strip + premiebord-card), slett-opprydding LIVE, hostile 5/5, testdata ryddet. Hvert påstått punkt er kryssjekket mot kode (admin-klient, dedup, Zod-legacy, SVG-rasterisering) og stemmer.

---

## Gates-seksjon

- **Bilingual nb+en:** `messages/no.json` + `en.json` fikk samme 10 nøkler (logoAlt, logoUpload, logoUploading, logoRemove, logo*Aria, 3 feil). `catalogParity` + `apostropheParity` grønne.
- **Humanizer:** Ny norsk copy («Filen er for stor. Maks 5 MB.», «Vi fikk ikke lest filen som bilde…», «Opplastingen feilet. Sjekk nettet og prøv igjen.», «Last opp sponsorlogo», «Fjern logo») er naturlig bokmål, ingen AI-tells.
- **MINOR-bump + CHANGELOG:** `package.json` 1.204.0 → 1.205.0; CHANGELOG Funksjon-rad «1.205 · Sponsorlogo på premiebordet» tilstede.
- **Refs #1052:** alle 9 commits har `Refs #1052` i body (verifisert).
- **DB/bucket:** staging påført + verifisert; prod pre-merge = eier-godkjenning (kjent avgrensning).

---

## Funn

Ingen. Implementasjonen følger kontrakten kriterium for kriterium; alle gates grønne kjørt selv; alle staging-avhengige påstander etterprøvd mot kilde og (kriterium 1 + 5) uavhengig re-kjørt.

**Kjente avgrensninger (per kontrakt/oppgave, IKKE funn):** prod-migrasjon 0143 gjenstår til eier-godkjenning før merge; opprett-wizarden ble ikke klikket live (delt komponent + unit-dekket); orphan-on-abandon er akseptert restrisiko i v1.

---

## VERDICT: ACCEPT
