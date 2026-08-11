# Kontrakt: Avslutnings-feil for oppretter forsvinner stille — /games/[id] rendrer aldri ?error (#1361)

Kilde: kontrakt-kommentar på issue #1361 (kontrakt-smeden, verifisert mot koden av
fersk-kontekst-agent før postering). Dette er byggeøktens kopi med avkryssede
suksesskriterier + evidens. PR: #1569, branch `claude/1361-games-error-banner`.
Produktvalg: JA — Alternativ A bygget; B beskrevet i PR-body; PR-en venter på eier.

## Problem

`endGame`-familien, sletting og redigering redirecter ved feil til `/games/[id]?error=…`
for en oppretter — men spill-hjem leste kun `?status`, så alle feilene forsvant stille
og spillet ble stående som Pågående uten forklaring.

## Design (som bygget — Alternativ A)

1. `(home)/page.tsx`: SearchParams utvidet med `error`; `ERROR_BANNER_CODES` med de 8
   nåbare kodene (not_active, no_players, not_all_submitted, not_all_approved, db_finish,
   db_players, not_deletable, not_editable) + not_found defensivt + unknown;
   `resolveErrorCode(first(sp.error), …, 'unknown')` — ukjent kode → generisk fallback,
   aldri crash, aldri stille dropp.
2. `Banner tone="error"` i `role="alert"`-wrapper med `data-testid="game-error-<kode>"`,
   rendret som delt fragment i BEGGE returns (scheduled-tidlig-return + hovedgrenen).
   Error vinner over `?status`.
3. Tekster gjenbrukt fra `admin.game.errors` (cross-namespace-lesing, presedens
   Sekretariat-siden); nye nøkler `not_deletable` + `unknown` i begge locales.
4. Stale-kommentar i `games/[id]/avslutt/page.tsx` (JSDoc-punktet) oppdatert.

## Suksesskriterier

- [x] `/games/[id]?error=<kode>` rendrer error-Banner med riktig tekst for alle 8 kodene,
  i begge locales — inkludert `not_active` på et SCHEDULED spill; ukjent kode → generisk
  fallback.
  **Evidens:** Playwright-driver mot staging-build av branchen: 9/9 koder PASS på norsk
  (eksakte tekster logget), `en:not_active` PASS («The game is not active and cannot be
  ended.»), `no:unknown-fallback` PASS («Noe gikk galt. Prøv igjen.» for
  `?error=totally_bogus_code`), `error-outranks-status` PASS (`?error=db_finish&status=
  submitted` → error-banner, 0 suksess-banner). Scheduled-grenen verifisert via den EKTE
  produsenten: `/games/<scheduled>/avslutt` → redirect til `?error=not_active` → banner
  rendret i tidlig-return-grenen (skjermbilde). Prod-vakt: 0 fremmede supabase-origins.
- [x] Stale-kommentaren er borte: grep `doesn't render \?error` i `app/` → 0 treff.
  **Evidens:** grep-exit 1 (0 treff) etter endringen; audit-dokumentet i docs/ urørt.
- [x] `npm run typecheck && npm test && npm run lint` grønt.
  **Evidens:** typecheck 0 feil, lint 0 errors, catalogParity + apostropheParity 4/4
  PASS, `npm run build` grønn, pre-push-gate (typecheck+lint+test) grønn ved push.
- [x] Staging-klikkrunde av reelt race: som oppretter, endring i annen «fane» etter
  sideinnlasting + trykk «Avslutt spillet» → banner på spill-hjem.
  **Evidens:** riggen lastet `/avslutt` (ren bekreftelse), service-role nullet
  medspillerens `submitted_at` (simulert gjenåpning i annet vindu), klikk «Avslutt
  spillet» → endGame bouncet → landet på `/games/[id]?error=not_all_submitted` med
  banneret rendret (URL + banner-assert PASS, skjermbilde). `needs-manual-qa` ikke
  nødvendig — racet lot seg rigge autonomt.
- [x] Funn-disiplin: `db_winners`-mislabelen i SideWinnersForm → eget issue.
  **Evidens:** issue #1567 opprettet (bug, area:admin, milestone Backlog).

## Gates

typecheck · lint · vitest (parity) · build — alle grønne. CI (verify + e2e @gate) på PR.

## Out of Scope (uendret fra kontrakten)

- Alternativ B (redirect-mål-endring) — bygges kun hvis eieren velger det i PR-en.
- `db_winners`-mislabelen (#1567).
- Banner for `?status=finished`; nye feilkoder; actions-logikk; roster-/admin-sidene.
