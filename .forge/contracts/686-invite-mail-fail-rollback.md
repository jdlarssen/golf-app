# Forge-kontrakt: #686 — inviteEmailToGame – sletting ved mail-feil

## Kontekst

`inviteEmailToGame` i `app/[locale]/admin/games/[id]/inviteToGameActions.ts` håndterer e-post-invitasjoner for ukjente brukere. Flyten er:

1. Sjekk om e-posten allerede tilhører en registrert bruker → ruter da gjennom eksisterende picker-add-sti
2. Idempotent sjekk: finnes en pending `invitations`-rad for (email, game_id)? → redirect til `?status=invite_sent` uten mail
3. Sett inn ny `invitations`-rad (autocommit)
4. Send Resend-mail (`sendInviteNotification`)
5. Ved unntaksfeil i steg 4: redirect til `?error=mail_failed` — men raden fra steg 3 er allerede committet
6. Neste gang admin sender på nytt: idempotent-sjekken i steg 2 finner den orphaned raden og redirecter til `?status=invite_sent` uten å sende mail → invitéen er strandert

**Rootårsak:** raden committer uavhengig av om mailen faktisk sendes. Feilstien i `catch`-blokken (linje 230–233) redirecter til `?error=mail_failed`, men uten å rydde opp i raden.

## Løsningsvalg

**To kandidater:**

**A. Slett raden på mail-feil (valgt):**
I `catch`-blokken, før redirect til `?error=mail_failed`, sletter vi den nettopp inserterte raden. Admin kan da prøve igjen med same e-post og få en fersk insert+send. Rollback er kompenserende (ikke en DB-transaksjon), men er atomisk nok fordi vi holder `rawEmail` + `gameId` i scope.

Slette-query: `supabase.from('invitations').delete().ilike('email', rawEmail).eq('game_id', gameId).is('accepted_at', null)`

**B. Re-send mail i idempotent-grenen:**
I `if (existingInvite)` (linje 203–206), send mailen best-effort uansett og redirect til `?status=invite_sent`. Dekker alle historical-no-notification tilfeller — selv de der mailen aldri var sendt av en annen grunn.

**Valg: A (primær) + delvis B.** Rollback-på-feil er den korrekte primærfiksen fordi den gjør statsmaskinen konsistent: `invitations`-raden eksisterer bare hvis mailen faktisk gikk ut. Siden vi også vil at admin kan re-sende til en allerede-invitert (f.eks. fordi de ikke fikk mailen), implementerer vi **B som en superset**: i idempotent-grenen (linje 203–206) forsøker vi å sende mailen på nytt best-effort (fanger alle feil, logger). Dette gjør retry-løyken meningsfull selv uten rollback.

Merk: `sendInviteNotification`-signaturen i `lib/mail/inviteNotification.ts` er allerede best-effort fra kallers perspektiv (den kaster hvis Resend gir error). Selve hjelpe-funksjonen endres ikke.

## Endringer

**`app/[locale]/admin/games/[id]/inviteToGameActions.ts`:**
- I `catch (err)` på linje 230: legg til delete-query mot `invitations` for (rawEmail, gameId, accepted_at=null) FØR redirect
- I `if (existingInvite)` på linje 203: send mailen best-effort (try/catch med console.error) FØR redirect til `?status=invite_sent`
- Begge endringer er i `inviteEmailToGame` — `addExistingPlayerToGame` berøres ikke

**Ingen nye filer.** Ingen migrasjon. Ingen miljøvariabel-endringer.

## Suksesskriterier

1. Kaste `sendInviteNotification` → `invitations`-raden slettes → admin kan sende på nytt til samme e-post og trigger ny insert+mail
2. Eksisterende pending invite (normalt idempotent flow) → mailen sendes best-effort på nytt (men feil her blokkerer ikke redirect til `?status=invite_sent`)
3. `npx tsc --noEmit` er grønn
4. `npm run build` er grønn
5. Ingen endring i happy-path-flyten: ny ukjent e-post, vellykket mail → `?status=invite_sent` som før

## Gates

- `npx tsc --noEmit` (ingen TypeScript-feil)
- `npm run build` (Next.js build uten feil)
- `npx vitest run app/[locale]/admin/games/[id]/inviteToGameActions.test.ts` — denne server-acsjonen HAR en co-located test-suite (16 tester). Den eksisterende «idempotent: pending invitation»-testen må oppdateres til Fix B (re-send), og to nye tester dekker de nye stiene (rollback-delete ved mail-feil + re-send i idempotent-grenen).

## Scope-grense

- Endrer ikke `addExistingPlayerToGame` (den har ingen `invitations`-rad å rydde opp)
- Endrer ikke `sendInviteNotification` (hjelpefunksjonen er allerede korrekt)
- Endrer ikke DB-skjema
- Idempotent retry-mail er best-effort: feil logger og avbrytes taust — det er ikke et nytt feilscenario
