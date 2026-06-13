# Evaluation: i18n Fase 2e — profil, venner, innboks, finn-turneringer (#573)

**Branch:** `claude/eloquent-pasteur-cb9d0d` (16 work commits + contract)
**Evaluated:** 2026-06-13, fresh-context skeptical pass
**Contract:** `.forge/contracts/573-i18n-fase-2e-profil-venner-innboks.md`

> **Diff-base caveat (important):** `origin/main` has moved 3 commits ahead of the
> branch's merge-base (`46ce7197`): `984ea6e3`, `9176750e fix(home): sort finished
> games newest-first`, `6849d589`. A plain two-dot `git diff origin/main` therefore
> shows spurious "deletions" of `lib/games/finishedOrder.ts` + `.test.ts` and
> `i18n/serverHelperHooks.test.ts` (82-line) that this branch never touched — they
> were *added* on main after the branch forked. All findings below use the
> three-dot `git diff origin/main...HEAD` (branch-only changes). The branch touches
> exactly 4 test files; none of the off-scope deletions are this branch's work.

---

## Criterion 1 — No hardcoded Norwegian UI literals in scope — **PASS**

- æøå-in-source grep over full §1 scope = 4 hits, **all JSX comments**
  (`{/* Innkommende forespørsler */}` etc. in `profile/venner/page.tsx:144/201/245`,
  `NotificationBell.tsx:68`) — comments excluded per contract. No string literals.
- Common-Norwegian-words grep (Velg/Lagre/Slett/Avbryt/Venter/Venn/Innboks/Hjem/
  Profil/Klubbhuset/snart/ukjent/Marker/Meld/Husk/Kopier/lest/seier/runde/fullført/…)
  = 1 hit: `profile/export/route.ts:8 'Ikke innlogget'` — **explicitly out of scope**
  (machine-facing 401 JSON body; contract Out of Scope + lines 82-83).
- Broad quoted-string net over profile/venner/innboks/finn-turneringer subtrees = 0.
- `lib/invitations/quota.ts`: `formatTimeUntil` **removed**, replaced by locale-agnostic
  `timeUntilStructured` returning `{kind:'soon'|'hours'|'minutes', n}`. Zero
  `formatTimeUntil` refs remain anywhere (non-test).
- `lib/notifications/groupByDay.ts`: locale-agnostic; `today`/`yesterday` labels now
  REQUIRED call-site params; only JSDoc Norwegian remains (exempt).

## Criterion 2 — Byte-identical Norwegian + no weakened test assertions — **PASS**

Spot-checked 15+ removed→added pairs across all 5 namespaces, all byte-identical:
- NotificationCard: `'Godkjenning trengs'`, `'Husk å levere scorekortet'`,
  `'Cupen er ferdigspilt'`, `'Åpne spillet for å bekrefte at du er med.'`,
  `'noen spillere har ikke fullført profilen'` → identical catalog values.
- **ICU plurals byte-identical:**
  - Bell: `count===1 ? 'ulest varsel' : 'uleste varsler'` →
    `{count, plural, one {ulest varsel} other {uleste varsler}}` ✓
  - Historikk: `'Ingen fullførte runder ennå'`/`'1 fullført runde'`/
    `${n} fullførte runder` → `{count, plural, =0 {Ingen fullførte runder ennå}
    one {1 fullført runde} other {{count} fullførte runder}}` ✓
  - Statistikk: `unitSingular="seier"`/`unitPlural="seire"` →
    `unitWinSingular:"seier"`/`unitWinPlural:"seire"` ✓; `'(ukjent)'` → `unknownPlayer` ✓
- Invite-sent ICU select: `✓ Invitasjon sendt${e ? ` til ${e}` : ''}.` →
  `✓ Invitasjon sendt{email, select, empty {} other { til {email}}}.` (leading space inside ` til {email}` preserved) ✓
- Venner status map (8 entries: `Venneforespørsel sendt.`, `Dere er venner nå!`,
  `Dere er allerede venner.`, `Forespørselen er allerede sendt.`,
  `Forespørselen er avslått.`, `Fjernet.`, `Du kan ikke legge til deg selv.`,
  `Skriv inn en e-postadresse.`) → identical.
- `window.prompt('Kopier lenken:', url)` → `copyPromptFallback:"Kopier lenken:"`;
  `'Kopiert!'`/`'Kopier lenke'` → `copiedLabel`/`copyLinkLabel` ✓.
- HomeDiscoverySection: `Bane ikke valgt`, `Meld meg på`, `Be om å bli med`,
  `Venter på godkjenning` → identical; `kl. ` separator → `discover.teeOffLine:
  "{date} kl. {time}"` (composed-key discretionary option, byte-identical).

**Test assertion integrity:** Only 4 test files touched (three-dot):
`InboxClient.test.tsx` (+`@/i18n/navigation` mock only), `invite/actions.test.ts`
(+`@/i18n/navigation`+`next-intl/server` mocks only), `quota.test.ts` (rename +
deliberate `.toBe('snart')`→`.toEqual({kind:'soon'})` signature change for the new
structured API), `groupByDay.test.ts` (signature arg added; `'I dag'`/`'I går'`
assertions PRESERVED unchanged; new en-locale Type A tests added). **No weakened or
changed Norwegian assertion strings.** All mock/signature adaptations only.

## Criterion 3 — Catalog integrity / English coverage — **PASS**

- `npx vitest run messages` → **3/3 green** (catalogParity enforces full no/en symmetry).
- en.json æøå scan (branch-added lines): only `"E.g. Bærum Golf Club"` (Norwegian
  place name in an English example placeholder — legitimate) + `Tørny` brand. No leaks.
- en.json Norwegian-function-word heuristic: all hits false-positive ("admin",
  "win"/"wins" key-name `seire`/`seier` with English values "wins"/"win").
- ICU args match no↔en: 39/41 keys-with-args exact; the 2 "mismatches"
  (`bellUnreadAria`, `historikk.roundCount`) are plural sub-form text differences
  (correct localization) — the actual interpolation arg `count` matches in both.
  `inbox.kinds.*` spot-check (10 keys): all args symmetric.

## Criterion 4 — All notification kinds + 5 block reasons via catalog — **PASS** (note: 21 kinds, not 20)

- `NotificationCard.tsx` switch is **exhaustive over the full `NotificationKind`
  union** (no `default`, TS-enforced). EMOJI map + switch both have **21 kinds**
  (contract undercounted "20"; all 21 covered). catalog `inbox.kinds.*` = 21 keys,
  no/en symmetric (diff = ∅).
- DB-content correctly NOT translated: `product_update` title/body rendered verbatim;
  `registration_rejected.reason` rendered verbatim with `defaultReason` catalog fallback.
  All names (game/team/club/player/tournament) passed as ICU args.
- `blockReasonText` covers the 5 codes (`incomplete_sides`, `pending_players`,
  `no_players`, `tee_missing`, `tee_missing_rating`) + `default` via
  `inbox.blockReasons.*` (6 keys, no/en symmetric).
- `friend_request`/`friend_accepted` use `actor_name ?? t('someoneFallback')`.

## Criterion 5 — Full gates — **PASS**

- `npx tsc --noEmit` → exit 0.
- `npm run test` → **263 files / 3375 tests, all passed** (matches contract claim).
- `npm run build` → exit 0. Route aggregate (incl. `┌` first-line):
  **81 ◐ / 9 ƒ / 2 ○ = 92 routes** — exact match to recorded main baseline.
  Every scope route ◐ (`/profile`, `/profile/{historikk,slett-konto,statistikk,venner}`,
  `/venner/legg-til/[code]`, `/finn-turneringer`, `/innboks`); home `/[locale]` ◐;
  `/profile/export` ƒ. The 2 ○ are `/_not-found` + `/manifest.webmanifest`.

## Criterion 6 — Live render (UI) — **PASS**

`npx next start -p 3100` (pid 7521, killed after). All 6 scope routes 307-redirect
locale-aware:
- `/finn-turneringer` → `/login?next=%2Ffinn-turneringer`
- `/en/finn-turneringer` → `/en/login?next=%2Fen%2Ffinn-turneringer`
- `/profile` → `/login?next=%2Fprofile`; `/en/profile` → `/en/login?next=%2Fen%2Fprofile`
- `/innboks` → `/login?next=%2Finnboks`; `/en/innboks` → `/en/login?next=%2Fen%2Finnboks`

On the 200-reachable login pages: **0 raw catalog-key leaks** (`a.b.c` pattern). The
in-scope global chrome **BottomNav renders correctly per locale**: NO page shows
Hjem/Innboks/Klubbhuset/Profil; EN page shows Home/Inbox/Clubhouse/Profile. (EN login's
only Norwegian = `Tørny` brand + `på` from the tagline — both 2f/login turf, out of scope.)

## Criterion 7 — Navigation imports migrated — **PASS**

- `next/navigation` in scope = exactly 2 imports, both `notFound`
  (`profile/page.tsx:2`, `venner/legg-til/[code]/page.tsx:1`) — exempt per contract.
- 17 `@/i18n/navigation` imports across scope (`redirect`/`useRouter`/`usePathname`).
- `/invite` stub locale-aware: `redirect({ href, locale })` + `getLocale()` (8ba53974).
- Server actions use object-form redirect with `getLocale()`. §4 payload-fallback move
  verified: no write-time «En venn» literal in venner actions; `actor_name` may be null;
  `someoneFallback` = "En venn"/"A friend".

## Criterion 8 — Version / CHANGELOG — **PASS**

- `package.json` = **1.118.0**.
- CHANGELOG: `1.118.y` series open at top with `[1.118.0]` entry; `1.117.y` series
  wrapped in `<details><summary>`. (Minor cosmetic: CHANGELOG prose says "alle 20
  varseltypene" — actually 21; non-blocking.)
- feat commit `028ee90f` co-stages `package.json` (1.117.0→1.118.0), `package-lock.json`,
  `CHANGELOG.md`, `messages/README.md` — commit-msg hook passed (feat prefix + bump).
- `messages/README.md` namespace list updated (`friends`, `inbox`, `discover`, `nav`).

## Criterion 9 — Playwright smoke — **PASS**

`npx playwright test` → **48 passed, 1 failed, 7 skipped**. The single failure is
`e2e/signup/open-register.spec.ts:27` (#559 signup smoke) — route `app/[locale]/signup/**`
and the spec are **untouched by this branch** (three-dot stat = ∅); 2f turf. Skips are
the signup full-flow tests gated on `SUPABASE_SERVICE_ROLE_KEY` (worktree `.env.local`
has only the 2 public keys — env limitation, not a regression).

---

## Findings

- **[cosmetic]** Contract + CHANGELOG say "20 notification kinds"; the actual
  `NotificationKind` union and `inbox.kinds.*` catalog both have **21** (all covered,
  exhaustive switch). Doc-count drift only. Non-blocking.
- **[cosmetic]** `inbox.kinds.productUpdate.*` catalog keys exist in both locales but
  the code renders `product_update` title/body verbatim from DB payload (correct), so
  those catalog keys appear vestigial/unused. Harmless; catalogParity stays symmetric.
  Non-blocking.
- **[info, not a defect]** Branch is 3 commits behind `origin/main`; a rebase before
  merge is advisable so the two-dot PR diff isn't polluted by `finishedOrder`/
  `serverHelperHooks` drift artifacts. Not a contract criterion.

No substandard findings affecting any contract criterion.

---

## Verdict

**ACCEPT** — All 9 evaluated criteria independently verified PASS. Norwegian output is
byte-identical (15+ pairs incl. all ICU plurals/select spot-checked), full English
coverage with symmetric catalogs (catalogParity 3/3), all 21 notification kinds + 6
block-reason keys via catalog, navigation fully migrated (only `notFound` exempt),
PPR shape identical to baseline (81 ◐ / 9 ƒ / 2 ○), gates green (tsc 0, 3375 tests,
build 0, playwright 48✓/1 pre-existing #559), version 1.118.0 + CHANGELOG correct,
live render confirms locale-aware redirects + correctly-localized BottomNav with no
key leaks. Only cosmetic doc-count nitpicks, which do not block.
