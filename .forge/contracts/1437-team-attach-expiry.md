# Kontrakt: #1437 — Team-attach-stien håndhever invitasjons-utløp

**Issue:** [#1437](https://github.com/jdlarssen/golf-app/issues/1437)
**Branch:** `claude/1437-team-attach-expiry`
**Type:** fix (bruker-synlig → `.changes/`-notat + staging-verifisering før merge).
Ingen produktvalg: #1348 satte utløpssemantikken i verifyCode-laget; dette lukker
det dokumenterte dekningshullet i lag-fløyen med samme figur.

## Rotårsak

Tre invitasjons-oppslag i signup-fløyen mangler utløpsfilter — en UTLØPT
lag-invitert kan fortsatt feste seg til laget:

1. `teamActions.ts` `attachToCaptainTeam` (~:940): slår opp på `id` alene før
   raden flippes til akseptert (:1061).
2. `team/page.tsx` (~:118): pending-oppslaget (`accepted_at IS NULL`) uten
   `expires_at`-betingelse → attach-tilbudet vises.
3. `page.tsx` (~:227): `hasPendingInvitation` likeså → lag-pekeren vises.

Utløpsregelen har dermed fått hjem nummer to som er uenig (AGENTS.md felle 4).

## Drift-tabell (sjekket mot HEAD 390fbb5d)

| Issue-påstand | HEAD-status |
|---|---|
| teamActions.ts:945 oppslag uten utløpsfilter | Stemmer (~:940–949, flip på :1061) |
| team/page.tsx:94–100 | Flyttet til ~:118–125 (#1343-refactoren: liste + `pickPendingInvitation`) — fortsatt uten utløpsfilter |
| page.tsx:227–234 | Stemmer (~:227–234) |
| «#1421/#1425-territoriet i aktiv endring» | AVKLART — PR #1421 merget 2026-08-07, #1343 lukket; ingen åpne PR-er på filene |

## Avgjørelser

- **D1 — samme figur som #1348:** `.gt('expires_at', new Date().toISOString())`
  på de tre oppslagene. Etablert form finnes i `login/actions.ts:351` og
  `getInviteLoginContext.ts:70`.
- **D2 — kun utløp, ikke mer:** accepted-semantikken i attach-oppslaget røres
  ikke (utenfor issue-scope). Ingen ny copy — en utløpt invitert ser samme
  skjermer som en uinvitert (samme valg som #1348).
- **D3 — testform:** FIFO-mocken (`buildSupabaseMock`) filter-emulerer ikke;
  det ærlige RED-beviset er query-formen: assert at invitations-oppslaget i
  attach-flyten kjeder `.gt('expires_at', <ISO>)` (via `__fromCalls`).
  Side-oppslagene (RSC-er uten test-hjem) dekkes av staging-flippen i S3.

## Suksesskriterier

- [x] **S1:** Test i `teamActions.test.ts` (eksisterende idiom): attach-flytens
      invitations-oppslag kjeder `.gt('expires_at', <gyldig ISO-timestamp>)` —
      RED mot HEAD. Eksisterende suite fortsatt grønn.
      **Evidens:** RED 22:04 («expected undefined to be defined», 1 failed /
      27 passed); GREEN etter fiks (120/120 i fløyen). Evaluator grep-verifiserte
      0 `.gt(`-kall på origin/main → testen er load-bearing.
- [x] **S2:** Gates: `npx vitest run` på `app/[locale]/signup/[shortId]/` +
      `npm run build` exit 0.
      **Evidens:** 10 filer / 120 tester grønne (builder OG evaluator);
      `npm run build` exit 0 (bakgrunnslogg); evaluator `tsc --noEmit` exit 0.
- [x] **S3:** Staging-flip-test på rigget lag-spill (kaptein + invitasjon til
      e2e-spiller): med `expires_at` i FORTID viser `/signup/<shortId>/team`
      ingen lag-kobling og base-siden ingen lag-peker; med `expires_at`
      flippet til FREMTID (eneste endring) dukker koblingen opp — beviser at
      det er utløpsfilteret som gater. Bevis-kommentar + `staging-verified`-label.
      **Evidens:** fase 1: generisk «Du har ikke et lag»-skjerm (ingen knapp,
      ingen kaptein-tekst); SQL-flip på samme rad; fase 2: «Karl "Jussa" vil ha
      deg med på laget Lag 1437» + «Bli med på lag». Skjermbilder begge faser;
      prod-vakt 0 treff; rigg slettet. PR #1640-kommentar + label.
      (Evaluator-note: base-sidens peker ble ikke eksplisitt drevet i begge
      faser — samme filterform, dekket av fase-designet.)
- [x] **S4:** `.changes/1437-*.md`-notat (type fix).
      **Evidens:** `.changes/1437-utlopt-lag-invitasjon.md`, type fix,
      issue 1437; dry-run grønn (evaluator).

## Gates

- `npx vitest run "app/[locale]/signup/[shortId]/"`
- `npm run build`

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Gyldig invitasjon | Uendret: attach-tilbud + kobling virker |
| Utløpt invitasjon | Ikke funnet i alle tre oppslag → samme skjermer som uinvitert |
| Utløper mellom sidelast og attach-klikk | Attach-oppslaget håndhever selv → `not_found` |
| Akseptert invitasjon | Uendret oppførsel (D2 — kun utløp i scope) |
| Flere invitasjoner, én utløpt | Kun gyldige når `pickPendingInvitation` (#1343-regelen urørt) |
| Ingen invitasjon | Uendret (ingen rad før og etter) |
| Tidssone | ISO-UTC begge sider, samme som #1348-figuren |
| RLS | Uendret — oppslagene bruker admin-client med eierskaps-sjekk på call-site som før |
