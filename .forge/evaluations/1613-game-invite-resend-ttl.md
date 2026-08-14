# Evaluering: #1613 — game-invite re-send TTL

**Dato:** 2026-08-14
**Branch:** `claude/1613-game-invite-resend-ttl` (HEAD 20c6aaea)
**Evaluator:** fresh-context forge-evaluator

## Per-kriterium

- **S1 (tester i eksisterende idiom): PASS** — `inviteToGameActions.test.ts` har (a) utløpt-pending-re-send som asserterer admin-klient-update med TTL 14 d ± 10 s fra `Date.now()`, `.eq('id', 'invitation-1')` og `.is('accepted_at', …)` via `__fromCalls`, og at mailen bærer den skrevne fristen og IKKE den gamle (`STALE_EXPIRES_AT`); (b) 0-rads-forlengelse → ingen mail + `error=invite_failed`; (c) eksisterende re-send-test oppdatert med `expiresAt: expect.any(String)` + admin-mock-kø. Begge nye tester er RED mot origin/main: der finnes ingen `getAdminClient`-update (assert (a) faller på `toBeDefined`) og mailen sendes uansett (assert (b) faller på `not.toHaveBeenCalled` + feil redirect). Mocken (`tests/serverActionMocks.ts`) logger reelt `update`/`eq`/`is` med args — assertions er load-bearing, ikke dekorative.
- **D1 (mail bærer NY frist): PASS** — `inviteToGameActions.ts:269` sender `expiresAt: freshExpiresAt`; radens `existingInvite.expires_at` brukes ikke lenger i mailen.
- **D2 (TTL ett hjem): PASS** — `lib/auth/inviteExpiry.ts` eksporterer `GAME_INVITE_TTL_DAYS = 14` + `gameInviteExpiresAtFromNow()`; både re-send (`:236`) og insert (`:278`) stempler derfra. Ingen inline `14 *`-TTL igjen i `inviteToGameActions.ts` (grep bekreftet). Egen unit-test i `inviteExpiry.test.ts` låser 14-dagers-spennet.
- **D3 (forlengelse FØR mail, admin-klient, expectAffected): PASS** — `:236–246`: `expectAffected(await getAdminClient().from('invitations').update({expires_at}).eq('id', …).is('accepted_at', null).select('id'), …)` skjer før `sendInviteNotification` (`:263`).
- **D4 (forlengelses-feil → ingen mail, error-redirect): PASS** — catch på `:247–253`: `console.error` + `redirect(?error=invite_failed)`; redirect kaster fra catch-blokken (ikke nestet i noen ytre try), så mail-kallet nås aldri. `expectAffected` kaster både på DB-error og 0 rader (`lib/supabase/affectedRows.ts`).
- **D5 (mail-feil etter forlengelse svelges): PASS** — try/catch rundt `sendInviteNotification` uendret; forlengelsen står, redirect `status=invite_sent`.
- **S2 (gates): PASS** — `npx vitest run` på de tre kontraktfilene: 3 filer, 43 tester grønne (denne økten). `npx tsc --noEmit` exit 0 (denne økten). Builder rapporterte full `npm run build` exit 0 — ikke re-kjørt her.
- **S3 (staging-bevis): PASS** — PR #1637-kommentar fra eier-kontoen: utløpt pending rigget (`email_is_invited` = false før), re-send drevet via UI (Playwright, invitasjonsskjema, redirect `status=invite_sent`), SQL-orakel etterpå på SAMME rad-id: `expires_at` +14 d (2026-08-28), `email_is_invited` = true, prod-vakt (0 kall utenfor staging-ref) og opprydding. `staging-verified`-label satt. Beviset er spesifikt (rad-id, e-post, redirect-param) — troverdig. Merk: PR er draft per #1516-konvensjonen.
- **S4 (.changes-notat): PASS** — `.changes/1613-utlopt-invitasjon-ny-frist.md`: frontmatter `type: fix`, `issue: 1613`; body 150 tegn (≤ 400), én linje i CHANGELOG-tone.
- **Scope: PASS** — 5 trackede filer, alle sporbare til #1613 (action + test, TTL-helper + test, changes-notat). Session-driverne `.staging-dev.mjs`/`.staging-verify-1613.mjs`/`.staging-verify-1631.mjs` er untracked (`??` i git status).
- **Risiko (admin-klient forbi RLS): PASS** — `requireAdminOrCreator(supabase, gameId)` kjøres på `:134`, før re-send-grenen (`:227`); admin-writen er låst til `.eq('id', existingInvite.id)` + `.is('accepted_at', null)`, kan aldri treffe andre rader eller aksepterte invitasjoner. Fiendtlig direkte PATCH er uendret flate (RLS + trigger står).

## Funn (ikke-blokkerende)

- `app/[locale]/games/guestPlayerActions.ts:222` — gjeste-claim-stien insert-er en `invitations`-rad med inline `14 * 24 * 60 * 60 * 1000`-TTL i stedet for `gameInviteExpiresAtFromNow()`. Utenfor kontraktens scope (D2 nevner kun `inviteToGameActions.ts`), men det er nettopp «TTL med to hjem»-driften D2 fjernet — bør bli eget issue (T2 sibling-sweep). (`ActivityLedger.tsx:32` er et 14-dagers lookback-vindu, ikke en TTL — irrelevant.)

VERDICT: ACCEPT
