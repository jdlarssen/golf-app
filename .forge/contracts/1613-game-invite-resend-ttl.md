# Kontrakt: #1613 — Re-send av spill-invitasjon forlenger fristen (aldri død mail)

**Issue:** [#1613](https://github.com/jdlarssen/golf-app/issues/1613)
**Branch:** `claude/1613-game-invite-resend-ttl`
**Type:** fix (bruker-synlig → `.changes/`-notat + staging-verifisering før merge).
Ingen produktvalg: #1381 satte semantikken («send på nytt» = frisk sjanse) for
admin-ventelisten; dette speiler den på spill-invitasjoner.

## Rotårsak

`inviteToGameActions.ts:224–246` (re-send-grenen) gjenbruker eksisterende rads
`expires_at` i mailen og forlenger aldri fristen. En utløpt spill-invitasjon får
dermed en «ny» mail som login-porten (`email_is_invited`: `expires_at > now()`,
migrasjon 0100) fortsatt avviser — død ved ankomst. TTL-en (14 dager) ligger
inline på `:248`.

## Drift-tabell (sjekket mot HEAD 390fbb5d)

| Issue-påstand | HEAD-status |
|---|---|
| Re-send-grenen `:216–246` gjenbruker `expires_at` | Stemmer (`:224–246`, mail får `existingInvite.expires_at`) |
| TTL 14 dager inline på `:248` | Stemmer |
| `lib/auth/inviteExpiry.ts` er TTL-hjemmet (#1381) | Stemmer (`INVITE_TTL_DAYS = 7` for admin-invitasjoner) |

## RLS-introspeksjon (denne økten, prod read-only)

Eneste UPDATE-policy på `invitations` er «self mark accepted» (admin ELLER
invitée som setter `accepted_at`), og triggeren `guard_invitations_self_update`
nekter alle andre kolonner for ikke-admin — men slipper service-role gjennom
(`auth.uid() is null`-grenen). En ikke-admin arrangør (#429-flyten via
`requireAdminOrCreator`) ville fått 0-rads-write via bruker-klienten.

## Avgjørelser

- **D1 — speil #1381:** hver re-send skyver `expires_at` ut en full TTL FØR
  mailen sendes; mailen bærer den NYE fristen. Gjelder også ikke-utløpte
  (samme «frisk sjanse»-semantikk som #1381).
- **D2 — TTL får ett hjem:** `GAME_INVITE_TTL_DAYS = 14` +
  `gameInviteExpiresAtFromNow()` i `lib/auth/inviteExpiry.ts`; både insert-stien
  (`:248`) og re-send-grenen bruker helperen. TTL-lengden er UENDRET (14 d) —
  å endre den ville vært et produktvalg.
- **D3 — forlengelsen skrives med admin-klienten** (`getAdminClient`) +
  `expectAffected` (`.eq('id')` + `.is('accepted_at', null)` + `.select('id')`).
  Begrunnelse: RLS-introspeksjonen over — bruker-klient-write ville stille
  no-op-et for ikke-admin arrangører (AGENTS.md felle 2/3). Enforcement-punkt
  for skrivestien: `requireAdminOrCreator`-gaten på action-en; fiendtlig direkte
  PATCH er fortsatt blokkert av RLS + trigger (uendret flate). Presedens:
  `getInviteEligibleIds` i samme flyt bruker allerede admin-klienten.
- **D4 — forlengelses-feil (DB-nekt eller 0 rader, f.eks. akseptert i
  mellomtiden) → `console.error` + redirect `?error=invite_failed`** (etablert
  param i samme fil), og mailen sendes IKKE — aldri mail uten gyldig frist.
- **D5 — mail-feil ETTER vellykket forlengelse:** uendret best-effort-swallow
  (#686 fix B) — forlengelsen står trygt igjen.

## Suksesskriterier

- [x] **S1:** Tester i eksisterende idiom (`buildSupabaseMock`, samme fil):
      (a) re-send av utløpt pending → admin-update med fremtidig `expires_at`
      og mail med SAMME nye frist (ikke radens gamle) — RED mot HEAD;
      (b) 0-rads-forlengelse → ingen mail + `error=invite_failed`;
      (c) eksisterende re-send- og insert-tester oppdatert mot helper-TTL,
      fortsatt grønne.
      **Evidens:** RED 21:27 (3 failed / 21 passed — nøyaktig de tre berørte);
      GREEN 21:28 (24/24). Evaluator bekreftet begge nye tester load-bearing
      mot origin/main.
- [x] **S2:** Gates: `npx vitest run` på `inviteToGameActions.test.ts` +
      `lib/auth/inviteExpiry.test.ts` + `admin/spillere/actions.test.ts`
      (deler TTL-hjemmet) + `npm run build` exit 0.
      **Evidens:** 3 filer / 43 tester grønne (builder OG evaluator);
      `npm run build` exit 0 (bakgrunnslogg); evaluator `tsc --noEmit` exit 0.
- [x] **S3:** Staging: rigg utløpt pending spill-invitasjon, driv re-send via
      UI (samme e-post i invitasjonsskjemaet), SQL-orakel:
      `expires_at > now()` etterpå og `email_is_invited(e-post)` = true.
      Bevis-kommentar + `staging-verified`-label på PR.
      **Evidens:** rigget `utlopt-1613@example.invalid` (utløpt i går,
      gate false) → Playwright-re-send som e2e-admin →
      `?status=invite_sent` → samme rad `5e05b259…` fikk +14 d (2026-08-28),
      gate true. Prod-vakt 0 treff. PR #1637-kommentar + label. Rigg slettet.
- [x] **S4:** `.changes/1613-*.md`-notat (type fix).
      **Evidens:** `.changes/1613-utlopt-invitasjon-ny-frist.md`, type fix,
      issue 1613, 150 tegn.

**Reviewer-funn (ikke-blokkerende):** inline 14 d-TTL i
`guestPlayerActions.ts:222` → filed som #1638 før merge.

## Gates

- `npx vitest run "app/[locale]/admin/games/[id]/inviteToGameActions.test.ts" lib/auth/inviteExpiry.test.ts "app/[locale]/admin/spillere/actions.test.ts"`
- `npm run build`

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Pending, utløpt | Forlenget + mail med ny frist (fiksens kjerne) |
| Pending, ikke utløpt | Forlenget + mail med ny frist (D1, #1381-semantikk) |
| Akseptert mellom les og skriv | 0 rader → NoRowsAffected → ingen mail, error-redirect |
| DB-feil på update | Ingen mail, error-redirect |
| Fersk insert | TTL fra delt helper, 14 d uendret |
| Mail feiler etter forlengelse | Swallow (D5), forlengelsen står |
| Ikke-admin arrangør | Admin-klient → forlengelsen virker (bruker-klient hadde no-op-et) |
| Registrert bruker-gren (`:190`) | Uendret — ingen invitations-rad involvert |
