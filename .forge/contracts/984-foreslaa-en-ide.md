# Forge-kontrakt: Foreslå en idé — lean feedback-boks (v0 av Ønskeliste)

**Issue:** [#984](https://github.com/jdlarssen/golf-app/issues/984) (Part of [#979](https://github.com/jdlarssen/golf-app/issues/979))
**Branch:** `claude/interesting-hopper-87fa96`
**Milestone:** Runde 2 — Neste
**Bump:** MINOR (`feat`, ny bruker-synlig funksjon) + 1 CHANGELOG Funksjon-rad
**Dato:** 2026-06-29

## Problem / kontekst

Roadmapen informeres i dag kun av eierens hode. Golferne har ingen flate for å si «jeg skulle ønske Tørny kunne …». Den fulle stemme-tavla (epic #979) er parkert bak en volum-trigger — ved 4–20 aktive brukere er stemmer/sosialt/AI overkill. **#984 er den komplette, leverbare featuren ved dagens skala:** én innsendings-boks + et admin-håndtak + en lukket «vi bygde det du foreslo»-sløyfe. Å bli hørt og se det skje virker allerede ved 4 brukere.

## Produkt-beslutninger (bekreftet med eier 2026-06-29)

1. **Innsendings-felt:** ett tekstfelt («Hva ønsker du deg av Tørny?»). Ikke tittel+beskrivelse. Lavest friksjon, matcher `idea_submissions.text`.
2. **«Vi bygde det»-varsel til golferen:** in-app innboks via det eksisterende `notify()`-systemet (ny kind `idea_built`), med e-post i tillegg når brukeren er off-app (`shouldAlsoSendMail`). Mest synlig i PWA-en.
3. **Varsel til admin ved innsending:** Resend-e-post til alle admins (`users.is_admin = true`), best-effort `Promise.allSettled` — matcher #984.

## Scope

### Med (bygges nå)
- Ett «Foreslå en idé»-felt nådd fra Klubbhuset (one-door-per-room): tile i Verktøy-seksjonen (`ToolsView`) → side `/foreslaa-ide`.
- Tabell `idea_submissions` + RLS (insert-own, select-own + admin-all, update/delete admin-only).
- Resend-varsel til admin ved innsending.
- Minimal admin-liste `/admin/ideer` (admin-only) med «Marker som bygd»-knapp per rad. *(Dette er det minste håndtaket den lukkede sløyfa krever — IKKE den parkerte godkjenningskøen fra #979.)*
- Lukket sløyfe: «Marker som bygd» → `idea_built` in-app-varsel til innsenderen (+ e-post når borte).

### Uten (parkert bak trigger, se #979)
Stemming, offentlig tavle, «Sluppet»-fane, godkjenningskø (approve/reject for offentlig tavle), AI-triage (#982), GitHub-roadmap-sync (#981), forfatter-redigering, kategorier.

## Design

### Datamodell — `idea_submissions` (migrasjon `0122_idea_submissions.sql`)
| kolonne | type | merknad |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `user_id` | uuid not null → `users(id)` on delete cascade | innsender, så admin kan svare direkte |
| `text` | text not null, CHECK `char_length(btrim(text)) between 1 and 2000` | selve idéen |
| `status` | text null, CHECK `status is null or status = 'bygd'` | null = ny, `'bygd'` = bygd |
| `built_at` | timestamptz null | settes ved «Marker som bygd» (audit + sortering) |
| `created_at` | timestamptz not null default `now()` | |

### RLS — `idea_submissions`
- **Enable RLS.**
- **INSERT:** `with check (user_id = (select auth.uid()))` — enhver innlogget setter inn egen rad.
- **SELECT:** `using (user_id = (select auth.uid()) or is_admin())` — bruker ser egne, admin ser alle.
- **UPDATE:** `using (is_admin()) with check (is_admin())` — kun admin (sette `status`/`built_at`).
- **DELETE:** `using (is_admin())`.
- Ingen status-immutabilitets-trigger nødvendig: ikke-admin kan ikke UPDATE i det hele tatt (mark-built er admin-only), så `0107`-trigger-mønsteret er overkill her.

### Notifikasjon — ny kind `idea_built`
Følger `achievement_unlocked`-presedensen (#947 / migrasjon `0118`):
- **Migrasjon (samme fil 0122):** drop+add `notifications_kind_check` med `'idea_built'` tilføyd (bevar hele eksisterende kind-settet).
- **`lib/notifications/types.ts`:** legg `'idea_built'` i `NotificationKind`-unionen + Zod payload-schema + `payloadSchemas`-record. Payload: `{ submission_id: string }` (snippet hentes ikke — tittel/detalj er generisk «Vi bygde det du foreslo»).
- **`lib/notifications/cardContent.ts`:** `case 'idea_built'` i `buildNotificationText` → tittel + detalj fra `inbox`-katalogen.
- **NotificationCard ikon/href** (om kind-mapping finnes): nøytralt ikon, lenke til `/foreslaa-ide` (eller linkless om enklest).
- **i18n:** `inbox.kinds.ideaBuilt.title` + `.detail` i `messages/no` + `messages/en`.
- **Tester:** `lib/notifications/types.test.ts` + `cardContent.test.ts` får ny kind-case (parametriserte arrays).

### Mail-helpere (best-effort, locale-aware, `Promise.allSettled`)
- `lib/mail/ideaSubmittedNotification.ts` — admin-on-submit (alltid, til alle admins). Subject/kropp: «{navn} foreslo en idé» + idé-teksten.
- `lib/mail/ideaBuiltNotification.ts` — user-on-built, sendes KUN når `notify()` returnerer `shouldAlsoSendMail`. «Vi bygde det du foreslo.»

### Ruter & server-actions
- **`app/[locale]/foreslaa-ide/page.tsx`** — innlogget-gated (ikke admin-gated) skjema med én textarea + submit. Tom/feil → inline-feil via `?error=`.
- **Action `submitIdea(formData)`** (`'use server'`): valider tekst → `getServerClient` → `expectOne` insert → best-effort admin-e-post (`Promise.allSettled` + `console.error`) → redirect til kvittering (`?sent=1`).
- **`app/[locale]/admin/ideer/page.tsx`** — admin-only (`getRoleContext()` → `notFound()` hvis ikke admin). Liste nyeste først; rad viser tekst + innsender + dato + status; «Marker som bygd»-knapp på ubygde.
- **Action `markIdeaBuilt(id)`** (`'use server'`): admin-guard → `expectOne` update `status='bygd', built_at=now()` → `notify({ userId, kind:'idea_built', payload })` → e-post-fallback når `shouldAlsoSendMail` → `revalidatePath`.

### Klubbhuset-inngang
- **Spiller (`ToolsView` i `PlayerKlubbhusViews.tsx`):** ny tile `{ label:'Foreslå en idé', href:'/foreslaa-ide', meta, icon }`.
- **Admin (`TilesGrid`):** ny tile `{ label:'Innsendte ideer', href:'/admin/ideer', badge: <ubygd-antall> }`.

### Norsk copy (kjør `humanizer` + `no-nb` for en-oversettelse før commit)
«Foreslå en idé» · «Hva ønsker du deg av Tørny?» · «Send inn» · «Takk! Vi har fått idéen din.» · «Innsendte ideer» · «Marker som bygd» · «Bygd» · «Vi bygde det du foreslo» · tom-tilstand «Ingen ideer ennå.»

## Suksesskriterier (evidens kreves før avhuking)

- [ ] **SC1 — Schema+RLS:** `0122_idea_submissions.sql` oppretter tabellen med RLS (insert-own / select-own+admin / update+delete admin-only) og utvider `notifications_kind_check` med `idea_built`. Påført staging via MCP og verifisert (tabell finnes, RLS på), deretter prod. *Evidens: migrasjonsfil + `list_tables`/`execute_sql`-output fra staging.*
- [ ] **SC2 — `idea_built`-kind wiret:** union + payload-schema + `cardContent`-case + inbox-i18n (no/en) + oppdaterte parametriserte tester. *Evidens: file:line + `vitest run lib/notifications` grønn + `npm run build` grønn (exhaustiv switch/Record dekket).*
- [ ] **SC3 — Innsending:** `/foreslaa-ide` rendrer textarea; `submitIdea` setter inn rad (`expectOne`); admin får Resend-e-post (best-effort). Verktøy-tile finnes i spiller-Klubbhuset. *Evidens: side rendrer på staging, rad opprettet (`execute_sql` count), helper file:line.*
- [ ] **SC4 — Lukket sløyfe:** `/admin/ideer` er admin-only, lister nyeste først; «Marker som bygd» setter `status='bygd'`+`built_at` (`expectOne`) og kaller `notify(...,'idea_built')`; innsender får innboks-item (+ e-post når off-app). Admin-tile med ubygd-badge. *Evidens: staging-klikkrunde (submit→mark→innboks-item) + `execute_sql` på `notifications`.*
- [ ] **SC5 — RLS-sikkerhet:** hostile-PATCH-test — ikke-admin kan IKKE PATCH `status`/`built_at` (mark-built) og kan IKKE SELECT andres innsendinger. Co-located insert-test (self-insert + read-own grønt). *Evidens: `vitest run` grønn for ny test-fil.*
- [ ] **SC6 — Copy & i18n:** all ny bruker-copy kjørt gjennom `humanizer`; både `no` + `en` nøkler finnes for alle nye strenger. *Evidens: humanizer-kjøring + nøkkel-grep i begge message-filer.*
- [ ] **SC7 — Release-disiplin:** `npm version minor`-bump + 1 CHANGELOG Funksjon-rad. Alle porter grønne. *Evidens: `package.json`-diff + CHANGELOG-linje + gate-output.*

## Gates (kjør scoped til det som endres)
- `npm run build` — **kritisk**: ny `NotificationKind` må treffe hver exhaustiv switch + Record-map ellers feiler Vercel-bygget (memory: tsc-gate-preexisting-trap).
- `npm run lint`
- `npx vitest run lib/notifications app/[locale]/foreslaa-ide app/[locale]/admin/ideer lib/mail` (+ ny RLS/insert-test-fil) — co-located tester for endrede filer.
- **Staging-klikkrunde** (bruker-synlig flyt, CLAUDE.md): submit → admin-e-post → marker bygd → innsender ser innboks-item. 0 prod-writes under testing.

## Avvik fra #984-teksten (eksplisitt)
- **`built_at`-kolonne** lagt til utover #984s bokstavelige felt-liste (`id, user_id, text, created_at, status`) — for audit + Sluppet-sortering senere. Billig, additivt.
- **Hostile-PATCH-test ER inkludert** for UPDATE-policyen (ikke-admin kan ikke mark-built). #984 sa «ikke relevant uten cross-user-lesing», men admin-only mark-built introduserer en reell vektor (falsk «vi bygde det»-trigger) som fortjener én test.
- **Bruker-pingets kanal** (in-app `notify()` + e-post-fallback) var uspesifisert i #984 (kun admin-varselet var spesifisert som Resend) — valgt for idiomatisk in-app-synlighet.
- **Admin-håndtak** er en minimal liste (`/admin/ideer`), påkrevd av den lukkede sløyfa — ikke den parkerte godkjenningskøen.

## Test-plan (per docs/test-discipline.md)
- **Type A:** ingen reell ren logikk (status er null/'bygd'). Hopp over med mindre en payload-builder dukker opp.
- **RLS:** hostile-PATCH-rig (ikke-admin: PATCH status / SELECT andres rad) + co-located insert (self-insert/read-own).
- **Type C:** maks én render-test for `/admin/ideer`-lista.
- **Type D (e2e):** utelatt for v0 — #984-akseptansen krever kun co-located insert + RLS. Staging-klikkrunde dekker golden path manuelt.

## Flyt-forankring
Introduserer en ny engasjements-flyt (community-feedback) som ikke står i `docs/flows/*-fremtid.svg`. Per epic #979 §12 er det en engasjements-feature, ikke et kjerne-loop-hull → ingen diagram-oppdatering kreves for denne lean-slicen (full flyt-diagram hører til om/når #979 av-parkeres).
