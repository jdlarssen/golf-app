# Spec: Vis invitasjons-frist til invitéen (#1179)

**Issue:** [#1179](https://github.com/jdlarssen/golf-app/issues/1179) · UX-psykologi: mild tap-aversjon (vennlig frist, aldri trussel) · konkret instans av #1174
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Invitasjoner har alltid `expires_at` (NOT NULL, database.types.ts:1011), men invitéen ser
aldri fristen fremover — bare etterpå-feilen «Invitasjonen din er utløpt»
([messages/no.json:2611](messages/no.json), `auth.errors.invite_expired`). En vennlig
formulert frist («gjelder til 24. juli») motiverer handling uten å true. Fristen skal vises
(a) i invite-mailen og (b) på #1169s kontekstkort på /login.

## Research Findings

- TTL-ene i dag: admin app-invite **7 dager** ([admin/spillere/actions.ts:83](app/[locale]/admin/spillere/actions.ts)),
  game-scoped **14 dager** ([inviteToGameActions.ts:246](app/[locale]/admin/games/[id]/inviteToGameActions.ts)),
  venne-invite **7 dager** ([invite/actions.ts:112](app/[locale]/invite/actions.ts)). Alle
  kallere holder `expiresAt` i en lokal variabel rett før `sendInviteNotification`-kallet.
- `resendInvitation` selecter kun `email, accepted_at` ([admin/spillere/actions.ts:120-126](app/[locale]/admin/spillere/actions.ts))
  og **forlenger ikke** `expires_at` — resend av en utløpt-men-ikke-akseptert rad er mulig
  (kun `accepted_at` sjekkes).
- `expires_at` brukes ellers kun til gating: pending-count ([admin/TilesGrid.tsx:45](app/[locale]/admin/TilesGrid.tsx)),
  `email_is_invited`-RPC og utløpt-oppslaget i `sendCode` (login/actions.ts:126-127).
- `mail.invite`-katalogen (no+en) + `getMailTranslator`/`resolveMailLocale` i
  [lib/mail/i18n.ts](lib/mail/i18n.ts) er mønsteret for lokalisert mail-copy;
  `inviteNotification.test.ts` har 20 approval-snapshots, ÉN chrome-lås.
- «Utløper {date}»-formen finnes kun for klubblisens (`klubb.status.expiresOn`) — gjenbrukes
  ikke direkte (annen kontekst/tone), men bekrefter dato-mønsteret.

## Prior Decisions

- **#1169 (kontrakt i `.forge/contracts/1169-login-kontekstkort-invitasjon.md`):**
  `getInviteLoginContext` returnerer allerede `expires_at` — kortdelen her er én ekstra linje.
- **#309/#318-mønsteret:** mal-tillegg komponeres inn i eksisterende template med defensiv
  fallback (param mangler → mal uendret), aldri ny parallell mal.
- **Copy-stemmen:** «sporty kompis» (CLAUDE.md `### Brand`), aldri videoens «I'll risk it»-
  skremsel. Humanizer-pass på all ny norsk copy.

## Design

**To uavhengige leveranser.** Del A står på egne ben; Del B bygges OPPÅ #1169s kort.

### Del A — frist i invite-mailen (uavhengig)

`InviteNotificationParams` får valgfri `expiresAt?: string` (ISO). Satt og i fremtiden →
én vennlig linje i både `html` og `text` med lokalisert dato (retning:
«Invitasjonen gjelder til {date} — hopp inn før den går ut.»; endelig copy via humanizer).
Mangler/ugyldig/fortid → malen bit-for-bit som i dag (defensivt). Alle tre kallerne sender
sin ferske `expiresAt`; `resendInvitation` selecter `expires_at` og sender den med.
Dato formateres i mail-locale (Oslo-tz, «24. juli»-form — gjenbruk/utvid mønsteret i
`lib/mail/`-i18n; builder velger plassering).

### Del B — frist på /login-kontekstkortet (avhengig av #1169)

Kortet får en frist-linje fra `expires_at` («Invitasjonen din gjelder til {dato}» eller
relativ «… utløper om {n} dager» — discretion). **Hvis #1169 ikke er merget når denne
bygges, leveres KUN Del A**, og Del B noteres eksplisitt som utestående i closing-kommentaren
(egen follow-up eller tas i #1169-PR-en).

## Edge Cases & Guardrails

- Resend av utløpt invitasjon → `expiresAt` i fortid → **utelat linjen** (aldri «gjaldt til
  i går»); dekkes av approval-case. Forlengelse av frist ved resend er IKKE i scope.
- Relativ visning på kortet (hvis valgt): < 1 dag igjen → «i dag»/«i morgen»-håndtering,
  aldri «om 0 dager». Beregn mot Oslo-tid (`lib/i18n/format`-helpers, aldri lokale getters).
- Tonen: aldri utropstegn-hastverk eller «skynd deg»; fristen er informasjon, ikke press.
- Snapshot-disiplin: `npx vitest -u` + visuell diff-review; chrome-låsen forblir ÉN;
  nye expiresAt-cases legges i EKSISTERENDE approval-fil — ingen ny testfil for copy.
- `escapeHtml` på alt som interpoleres i html-delen (dato er trygg, men følg mønsteret).

## Key Decisions

- **Absolutt dato i mailen** (ikke relativ): mail leses ofte dager senere — «om 3 dager»
  ville lyve. Kortet rendres live og kan være relativt.
- **Ingen migrasjon/TTL-endring:** 7d/14d-verdiene består; vi viser dem bare.
- **To leveranser i én kontrakt** med eksplisitt nedgradering til kun Del A hvis #1169
  ikke finnes — mail-delen skal aldri vente på kortet.

**Claude's Discretion:** endelig copy no+en (humanizer); absolutt vs. relativ form på kortet;
katalog-nøkkelnavn (`mail.invite.expiresLine`, `auth.inviteCard.expires` foreslått); om
dato-formatteren bor i `lib/mail/i18n.ts` eller egen helper; CHANGELOG-tagline.

## Success Criteria

- [x] Game-scoped invite-mail viser frist-linje med lokalisert dato (14-dagers-datoen) i
      både html og text — snapshot-diff reviewd visuelt, `npx vitest run lib/mail` grønn.
      **Bevis:** `inviteNotification.test.ts` case «expiresAt i fremtiden» → «Invitasjonen din
      gjelder til 24. juli 2099.» i html + text; 14/14 grønn.
- [x] Åpen venne-/admin-invitasjon viser 7-dagers-datoen (samme mekanisme). **Bevis:** alle
      tre kallerne (`invite/actions.ts`, `admin/spillere/actions.ts`,
      `inviteToGameActions.ts` fresh+retry) sender nå `expiresAt`.
- [x] Uten `expiresAt`, eller med dato i fortid (resend av utløpt) → mal uendret/linje
      utelatt. **Bevis:** approval-cases «expiresAt i fortid» + «uten expiresAt» →
      `expiresLineHtml(...)` er `null`; base-chrome-snapshot uendret.
- [x] Hvis #1169s kort finnes: kortet viser vennlig frist. **#1169 er MERGET** (PR #1211/#1214),
      så Del B er bygget: `InviteContextCard` viser relativ nedtelling via `inviteExpiryTier`.
      Staging-klikkrunde av /login?invite=<token> gjenstår FØR merge.
- [x] Copy no+en i paritet (catalogParity grønn); norsk copy humanizer-kjørt før commit.
      **Bevis:** `catalogParity.test.ts` grønn; humanizer-pass → ingen endringer (ren copy).
- [x] Staging: frist-linja verifisert på `torny-staging`. **Bevis:** kortet på
      `/login?invite=<token>` viste «utløper om 7 dager» (no) / «expires in 7 days» (en) —
      skjermbilde + PR-kommentar #1225. Mail-body render-verifisert via prod-kodestien
      («…gjelder til 25. juli 2026.»); faktisk Resend-leveranse er uendret best-effort-infra.

## Gates

- [x] `npx tsc --noEmit` grønn · `npm run lint` grønn (0 errors; kun pre-eksisterende
      complexity-warnings i urørte filer)
- [x] Co-located vitest for endrede filer grønn (177 grønn: mail + format + inviteExpiry +
      InviteContextCard + catalogParity + apostropheParity)
- [x] Staging-verifisering av kort (ende-til-ende, no+en) + mail-render FØR merge —
      `staging-verified`-label + bevis-kommentar på PR #1225
- [x] feat-commit: MINOR-bump (1.191→1.192) + CHANGELOG Funksjon-rad; alle commits `Refs #1179`

## Files Likely Touched

- `lib/mail/inviteNotification.ts` (+ `.test.ts`-snapshots/-cases) — `expiresAt`-param + linje
- `lib/mail/i18n.ts` (evt.) — dato-formatter for mail
- `app/[locale]/admin/spillere/actions.ts` (send + resend-select),
  `app/[locale]/admin/games/[id]/inviteToGameActions.ts`, `app/[locale]/invite/actions.ts`
- `messages/no.json` + `messages/en.json` — `mail.invite.*` (+ `auth.inviteCard.*` for Del B)
- Del B: `app/[locale]/(auth)/login/_components/InviteContextCard.tsx` +
  `lib/auth/getInviteLoginContext.ts` (fra #1169)
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Påminnelses-mail før utløp (cron/nudge) — egen sak hvis ønsket
- Forlengelse av `expires_at` ved resend (mulig follow-up-issue)
- Endring av TTL-verdiene eller `email_is_invited`-gatingen
- Frist på team-invitasjons-mailen (`mail.teamInvitation`) og klubb-invitasjoner — egen vurdering
- #1174 (generisk tap-aversjon) — eier vurderer lukking når denne shipper
