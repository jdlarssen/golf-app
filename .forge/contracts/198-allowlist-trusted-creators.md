# Contract: Allowlist-MVP — trusted creators

**Issue:** [#198](https://github.com/jdlarssen/golf-app/issues/198)
**Parent:** [#22](https://github.com/jdlarssen/golf-app/issues/22) (full RLS-revisjon — denne MVP-en gater den)
**Branch:** `claude/wonderful-goldwasser-b38897` (eksisterende worktree)
**Seed:** `fornes.even@yahoo.no`

## Mål

La en hardkodet allowlist av ikke-admin-brukere opprette spill via en ny `/opprett-spill`-rute som gjenbruker eksisterende game-form, **uten** RLS-endringer, nye tabeller eller ny rolle. Eksisterende admin-flyten (`/admin/games/new`) skal være uendret.

## Tekniske beslutninger (besluttet av Claude per `feedback_no_technical_decisions`)

### 1. Rute: `/opprett-spill` (utenfor `/admin/*`)

Issue §4 lister to UI-muligheter. Velger **kopi til ny rute** istedenfor «åpne admin-shell for trusted»:
- Issue-suksess-kriterium 6 sier «/admin-shellen avviser fortsatt trusted brukere (de skal ikke se Sekretariatet)» — dette krever en ikke-admin-rute uansett.
- Dagens `app/admin/layout.tsx:14-32` redirecter alle ikke-admin til `/`. Lifting av den gate-en vil eksponere `/admin/spillere`, `/admin/baner` etc. for trusted — ikke ønsket.
- Form-en ekstraheres til delt komponent `app/admin/games/new/NewGameForm.tsx` for å unngå kopi-drift.

### 2. Helper: `lib/admin/auth.ts`

Ingen eksisterende `requireAdmin()`. Lager begge i én fil:
- `requireAdmin()` — refaktorerer inline-mønster fra `app/admin/layout.tsx` og `app/admin/games/new/actions.ts`. Returnerer `{ userId }` eller redirecter til `/`.
- `requireAdminOrTrustedCreator()` — samme, men aksepterer e-poster i `TRUSTED_CREATOR_EMAILS`. Returnerer `{ userId, isAdmin }` slik at callers kan velge admin-client-bypass.

### 3. RLS-strategi: admin-client-bypass i server-action

Issue §3 anbefaler Mulighet A. Dagens `createGameInternal` (`app/admin/games/new/actions.ts:75`) bruker `getServerClient()` (request-scoped). Når caller er trusted-but-not-admin og `games`-tabellens RLS INSERT-policy krever `is_admin`, byttes klienten til `getAdminClient()` for INSERT-fasen.

Verifiserer først om RLS faktisk blokkerer — hvis ikke trengs ikke bypass. (Hvis insert tillates for «authenticated», beholdes request-client.)

### 4. Audit-log: ikke utvidet

Issue §5-observasjons-SQL spør `admin_audit_log` for `game.created`. Den event-typen finnes ikke i `AdminAuditEventType` (`lib/admin/auditLog.ts:10-14`). MEN `games.created_by` (`actions.ts:129`) settes alltid til actor-user-id. Skriver om observasjons-SQL-en i closing-kommentaren til å spørre `games`-tabellen direkte:

```sql
select created_by, count(*), min(created_at), max(created_at)
from games
where created_by in (select id from users where email = any('{fornes.even@yahoo.no, ...}'::text[]))
group by created_by;
```

Sparer scope (ingen `AdminAuditEventType`-utvidelse, ingen `logAdminEvent`-kall i create-flyten) — i tråd med small-bet-prinsippet.

### 5. Hjem-side-CTA

`app/page.tsx:175-181` har i dag «Opprett en turnering»-knapp i empty-state, gated på `is_admin`. Utvider gate-en til `is_admin || isTrustedCreator(email)`, lenke til `/opprett-spill` (ikke `/admin/games/new` — trusted skal aldri inn på admin-rute).

For non-empty state (`app/page.tsx:225-346`): legger til en sekundær CTA-knapp synlig for samme gruppe. Plasseres i passende seksjon (over admin-seksjonen).

## Filer som endres

| Fil | Status | Hva |
|---|---|---|
| `lib/admin/trustedCreators.ts` | NY | `TRUSTED_CREATOR_EMAILS = ['fornes.even@yahoo.no']` + `isTrustedCreator(email)` |
| `lib/admin/auth.ts` | NY | `requireAdmin()` + `requireAdminOrTrustedCreator()` |
| `lib/admin/trustedCreators.test.ts` | NY | Unit-test: case-insensitive, null/undefined, empty array, present/missing |
| `lib/admin/auth.test.ts` | NY (valgfri) | Unit-test for helpers hvis de er rene nok å mocke; ellers dekkes via actions-test |
| `app/admin/games/new/NewGameForm.tsx` | NY | Ekstrahert form fra dagens `page.tsx` (delt mellom admin + opprett-spill) |
| `app/admin/games/new/page.tsx` | ENDRET | Bruker `requireAdmin()` + `<NewGameForm />` + `<AdminShell>` |
| `app/admin/games/new/actions.ts` | ENDRET | Bruker `requireAdminOrTrustedCreator()`; admin-client-bypass ved INSERT for trusted-non-admin (hvis RLS krever det) |
| `app/admin/games/new/actions.test.ts` | ENDRET | Nye tester: `is_admin=false` + trusted → tillates; `is_admin=false` + ikke-trusted → redirecter; admin → uendret |
| `app/admin/layout.tsx` | ENDRET | Refaktorerer inline `is_admin`-sjekk til `requireAdmin()` |
| `app/opprett-spill/page.tsx` | NY | Bruker `requireAdminOrTrustedCreator()` + `<AppShell>` + `<NewGameForm />` |
| `app/page.tsx` | ENDRET | CTA-gate utvidet til admin-eller-trusted, lenker til `/opprett-spill` |
| `package.json` | ENDRET | Bump `1.15.4` → `1.16.0` (minor, ny bruker-synlig funksjon) |
| `CHANGELOG.md` | ENDRET | Ny oppføring under nyeste minor-serie |

## Scope ut (eksplisitt)

- Ingen RLS-policy-endringer på `games`, `game_players`, `courses`, `course_holes`, `tee_boxes`, `invitations`
- Ingen DB-migrasjoner, ingen nye tabeller, ingen nye kolonner
- Ingen `users.can_create_games`-felt
- Ingen ny rolle eller enum-utvidelse
- Ingen `game.created` audit-log-event
- Ingen self-service «be om trusted»-flyt
- Ingen analytics-dashboard for observasjons-vinduet
- Trusted brukere får IKKE tilgang til `/admin/spillere`, `/admin/baner`, eller noen annen `/admin/*`-side enn det vi eksplisitt åpner

## Suksess-kriterier (kontrakts-disiplin: en checkbox per kriterium, med bevis)

- [ ] **K1:** `lib/admin/trustedCreators.ts` finnes, eksporterer `TRUSTED_CREATOR_EMAILS` (med `fornes.even@yahoo.no`) og `isTrustedCreator(email)` som er case-insensitive og null-trygg. Unit-tester passerer.
- [ ] **K2:** `lib/admin/auth.ts` finnes, eksporterer `requireAdmin()` og `requireAdminOrTrustedCreator()`. Begge brukes av eksisterende admin-flater og den nye ruten.
- [ ] **K3:** `app/admin/games/new/page.tsx` rendres uendret for admin-brukere (samme felter, samme handling, samme AdminShell). Snapshot/visuell sanity-check.
- [ ] **K4:** `/opprett-spill` finnes, gated av `requireAdminOrTrustedCreator()`, rendrer `<AppShell>` (ikke AdminShell) + den delte `<NewGameForm />`. Trusted bruker som logger inn kan navigere dit og opprette spill.
- [ ] **K5:** Hjemmesiden (`app/page.tsx`) viser «Opprett spill»-CTA for trusted-eller-admin-brukere, lenket til `/opprett-spill`. Ikke synlig for ikke-trusted ikke-admin-brukere.
- [ ] **K6:** `/admin/games/new`-server-action (`createGameDraft` / `createAndPublishGame`) tillater trusted-non-admin å lykkes med opprettelse. `games.created_by` settes til trusted user sin `user_id` (ikke en admin). Ikke-trusted ikke-admin blir fortsatt redirected.
- [ ] **K7:** `app/admin/layout.tsx` redirecter fortsatt trusted-non-admin til `/` (de ser ikke Sekretariatet). Bare admin når `/admin/*`.
- [ ] **K8:** Eksisterende test-suite grønn (`npm test`). Nye tester for trusted-creator-cases passerer.
- [ ] **K9:** `npm run lint` grønn.
- [ ] **K10:** `npm run build` grønn (inkluderer typecheck).
- [ ] **K11:** Version bumpet `1.15.4` → `1.16.0`. CHANGELOG-oppføring lagt til med stakeholder-tagline.

## Gates (kjøres etter hver chunk)

```bash
npm run lint
npm test
npm run build
```

`npm test` kjøres scoped til endrede områder underveis, full suite før evaluator.

## Commits-plan (atomiske)

1. `feat(admin): add trustedCreators allowlist + isTrustedCreator helper` (K1)
2. `refactor(admin): extract requireAdmin/requireAdminOrTrustedCreator helpers` (K2 + refaktorering av layout.tsx + actions.ts)
3. `refactor(admin): extract NewGameForm component for reuse` (K3, ingen oppførselsendring)
4. `feat(admin): add /opprett-spill route for trusted creators` (K4 + K6 — versjons-bump-commit, MINOR)
5. `feat(home): show 'Opprett spill' CTA for trusted creators` (K5 — patch-bump? Nei, samme bruker-synlige feature som K4 — kombineres i samme commit hvis mulig, eller egen patch)

Sannsynligvis kombinerer 4 + 5 til én feat-commit slik at version-bump-hooken er fornøyd og CHANGELOG-en får én sammenhengende oppføring. Backend-refaktoreringer (1, 2, 3) er rene `refactor:`/`feat(admin):` uten bruker-synlig endring → ingen version-bump (men commit 1 er strengt tatt en `feat:` som introduserer en ny modul — den blir `chore` eller `refactor` siden ingen bruker ser den ennå).

Endelig plan justeres ved første blokkering fra commit-msg-hooken.

## Ut-av-scope-funn å notere underveis

Hvis subagenten finner:
- Eksisterende `is_admin = false`-test mangler i actions.test.ts (bekreftet av scout): legges til som del av K8
- RLS-policy på `games.INSERT` tillater faktisk «authenticated»: noter i closing-kommentar, dropper admin-client-bypass
- Snapshot-tester som låser admin-only-CTA på home: oppdateres som del av K5

Andre funn → ny GitHub-issue per `feedback_review_findings_as_issues`.
