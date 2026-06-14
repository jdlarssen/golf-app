# Forge-kontrakt: #583 — i18n signup-varsel-payloads

> **STATUS: ACCEPT** (2026-06-14, skeptisk fresh-context opus-eval). Alle K1–K8
> PASS, 224 tester grønne, `tsc` + `build` grønn, norsk byte-identisk. Detaljer i
> `.forge/evaluations/583-i18n-signup-notification-payloads.md`.

> Lag-påmeldingens varsel-payloads skrives med norske strenger til DB ved
> sending — når mottakerens locale er ukjent. De rendres senere av
> `NotificationCard` (innboks), så en **engelsk mottaker ser norsk tekst**.
> Flytt komposisjonen til render-tid: lagre strukturerte/nullable felt i
> payloaden, la `NotificationCard` sette dem sammen via katalog-nøkler.

**Issue:** https://github.com/jdlarssen/golf-app/issues/583
**Branch:** `claude/jolly-cartwright-201bc1`
**Epic:** #60 (i18n), oppfølging av Fase 2f (#581) / 2e (#573) / M (#594)
**Type:** `fix(i18n)` — bruker-synlig korrekthet for engelske mottakere. Norsk
output **byte-identisk** (samme strenger, bare flyttet til katalog). PATCH-bump.

---

## Etablert presedens (følg dette)

Fase 2e (#573) løste samme klasse for venne-varsler:
- Payload-feltet ble **nullable/optional**; actions lagrer ekte navn når kjent,
  utelater ellers.
- `NotificationCard` rendrer `actor_name ?? t('inbox.someoneFallback')` på
  render-tid i mottakerens locale.
- **Gamle lagrede rader rendres verbatim — akseptert legacy. Ingen DB-backfill.**

Vi gjenbruker nøyaktig dette mønsteret.

`inbox.someoneFallback` = «En venn»/«A friend» er **venne-spesifikk** — feil ord
for lag/spiller-kontekst. Vi legger til to nye, kontekstriktige fallbacks.

---

## Funn: scopet er hele `teamActions.ts`, ingenting annet

Scan av alle ~18 `notify()`-kallsteder: **ingen hardkodet norsk payload-
komposisjon utenfor `app/[locale]/signup/[shortId]/teamActions.ts`**. De andre
lagrer allerede strukturert data (navn rett fra DB) eller bruker #573-fallback.
Den «brede varsel-payload-fasen» issue-body lufter er i praksis tom utover dette.

Den trofaste fiksen berører **fire** varsel-kinds (ikke bare de 3 instansene
issue-en listet), fordi `getCaptainDisplayName`'s `'En spiller'`-fallback og en
`'Laget'`-fallback mater også `team_member_withdrew` og `team_invite`. En engelsk
mottaker ser ellers fortsatt «En spiller»/«Laget» der — som er nøyaktig bug-en.
Dette er korrekt closure av issue-en, ikke scope-creep.

### Konkrete norsk-i-payload-steder (alle i `teamActions.ts`)

| # | Sted | Kind | Felt | Norsk literal |
|---|------|------|------|---------------|
| 1 | `getCaptainDisplayName` ~159 | (kilde) | returverdi | `'En spiller'` |
| 2 | `submitTeamRegistration` ~535 | `registration_request` | `requester_name` | `` `${captainName} (kaptein for ${teamName})` `` |
| 3 | `declineTeamInvite` ~759/767 | `team_member_withdrew` | `withdrawn_player_name` (via #1), `team_name` | `'Laget'`-fallback |
| 4 | `removeTeamMember` ~855 | `registration_rejected` | `reason` | `'Kapteinen fjernet deg fra laget.'` |
| 5 | `attachToCaptainTeam` ~1078/1084 | `team_invite` | `invited_by_name` (via #1), `team_name` | `'Laget'`-fallback |

### Søster-skrivere av samme kinds (også inne — samme bug, samme tittel-scope)

| Sted | Kind | Norsk literal |
|------|------|---------------|
| `signup/actions.ts:93` `getRequesterName` | `registration_request` (individuell) | `'En spiller'` |
| `withdrawActions.ts:214` `withdrawFromGame` | `team_member_withdrew` | `'En spiller'` |

Disse skriver **nøyaktig samme kinds** jeg gjør nullable. Lar jeg dem stå, lekker
samme kind fortsatt norsk fra en søster-sti — K1/K5 ville vært halv-sanne. De er
«signup-varsel-payloads» per issue-tittelen, så de er inne. Begge: returner/sett
`null` ved manglende bruker-rad, la render-tid-fallbacken ta locale-en.
(`withdrawActions.team_name` er guardet non-null ved `if (…teamName)` → ingen
`'Laget'`-problem der.)

**`invite/actions.ts:106` (`invite`-kind, `'En venn'`) holdes UTE:** annen kind,
admin-invite-flyt (ikke signup). Det er den brede «varsel-payload-i18n-fasen»
issue-body bevisst utsetter under epic #60. Nevnes i closing, ikke fikset her.

**Viktig avgrensning — `registration_rejected.reason` forblir fritekst:** admin-
avvisning (`admin/games/[id]/signups/actions.ts:339`) sender en **ekte bruker-
tastet** `rejection_reason` inn i `reason`. Den må fortsatt rendres verbatim. Kun
den app-genererte lag-fjernings-grunnen flyttes — via et nytt `reason_code`-felt.

---

## Design (render-tid-komposisjon)

### Katalog — `messages/no.json` + `messages/en.json`, `inbox`-namespace

| Nøkkel | no (byte-identisk m/ dagens literal) | en |
|--------|--------------------------------------|-----|
| `inbox.somePlayerFallback` | `En spiller` | `A player` |
| `inbox.someTeamFallback` | `Laget` | `The team` |
| `inbox.kinds.registrationRequest.captainOf` | `{name} (kaptein for {teamName})` | `{name} (captain of {teamName})` |
| `inbox.kinds.registrationRejected.reasonCodes.team_removed` | `Kapteinen fjernet deg fra laget.` | `The captain removed you from the team.` |

`catalogParity.test.ts` håndhever automatisk at alt finnes i begge locales.

### Schema — `lib/notifications/types.ts`

- `registrationRequestSchema`: `requester_name` → `.nullable().optional()`;
  **legg til** `team_name: z.string().min(1).optional()`.
- `registrationRejectedSchema`: **legg til** `reason_code: z.enum(['team_removed']).optional()`
  (`reason` beholdes uendret for admin-fritekst).
- `teamMemberWithdrewSchema`: `withdrawn_player_name` → `.nullable().optional()`;
  `team_name` → `.nullable().optional()`.
- `teamInviteSchema`: `invited_by_name` → `.nullable().optional()`;
  `team_name` → `.nullable().optional()`.

### Render — `components/notifications/NotificationCard.tsx`

- `registration_request`:
  ```ts
  const name = p.requester_name ?? t('somePlayerFallback');
  const requesterName = p.team_name
    ? t('kinds.registrationRequest.captainOf', { name, teamName: p.team_name })
    : name;
  // title: t('kinds.registrationRequest.title', { requesterName })
  ```
- `registration_rejected`:
  ```ts
  detail: p.reason
    ?? (p.reason_code
      ? t(`kinds.registrationRejected.reasonCodes.${p.reason_code}`)
      : t('kinds.registrationRejected.defaultReason'))
  ```
- `team_member_withdrew`: `withdrawnPlayerName: p.withdrawn_player_name ?? t('somePlayerFallback')`,
  `teamName: p.team_name ?? t('someTeamFallback')`.
- `team_invite`: `invitedByName: p.invited_by_name ?? t('somePlayerFallback')`,
  `teamName: p.team_name ?? t('someTeamFallback')`.

### Actions — `teamActions.ts` + `lib/notifications/notifyInvitedToTeam.ts`

- `getCaptainDisplayName`: returtype → `Promise<string | null>`; `if (!data) return null`.
- ~535: `requester_name: captainName`, **legg til** `team_name: teamName` (fjern komposisjon).
- ~759/767: `withdrawn_player_name: declinerName`, `team_name: captainReq.team_name ?? req.team_name` (fjern `?? 'Laget'`).
- ~855: fjern `reason: '…'`, sett `reason_code: 'team_removed'`.
- ~1078/1084: `invitedByName: captainName`, `teamName: captainReq.team_name ?? child.team_name` (fjern `?? 'Laget'`).
- `notifyInvitedToTeam` opts: `teamName: string | null`, `invitedByName: string | null` (payload passerer gjennom).

---

## Success criteria

- [ ] **K1.** Ingen hardkodet norsk streng igjen i en `notify()`-payload i
  `teamActions.ts`, `signup/actions.ts` (`getRequesterName`) eller
  `withdrawActions.ts` (verifiser: `grep` for `En spiller`/`Laget`/`kaptein for`/
  `Kapteinen fjernet` i disse → kun katalog/kommentar; `invite/actions.ts` sin
  `'En venn'` er bevisst utenfor scope).
- [ ] **K2.** `getCaptainDisplayName` returnerer `string | null`; alle tre
  kallsteder (~318, ~759, ~1078) håndterer null via render-tid-fallback.
- [ ] **K3.** `registration_request`-payload bærer plain `requester_name`
  (nullable) + optional `team_name`; `NotificationCard` komponerer
  «(kaptein for …)» via `captainOf`-nøkkel. Individuell selv-påmelding
  (`signup/actions.ts`, ingen `team_name`) rendrer fortsatt bart navn.
- [ ] **K4.** `registration_rejected` fra lag-fjerning bruker `reason_code:
  'team_removed'`; admin-fritekst-`reason` rendres fortsatt verbatim.
- [ ] **K5.** `team_member_withdrew` + `team_invite` bruker `somePlayerFallback`/
  `someTeamFallback` på render-tid; ingen `'Laget'`/`'En spiller'` i payload.
- [ ] **K6.** 4 nye katalog-nøkler finnes i **både** no.json og en.json;
  `catalogParity.test.ts` grønn. Norsk output uendret fra før (samme strenger).
- [ ] **K7.** `npm run build` grønn (Zod-shape + exhaustiv `NotificationCard`-
  switch + alle payload-writers typer korrekt).
- [ ] **K8.** Versjon bumpet (PATCH) + CHANGELOG-oppføring; `fix(i18n)`-commit
  passerer commit-msg-hook.

## Gates (kjør scoped til endring)

1. `npx vitest run messages/catalogParity.test.ts lib/notifications/` — parity + payload-schema.
2. `npx tsc --noEmit` (eller `npm run build`) — exhaustiveness + nullable-propagering.
3. Hvis `NotificationCard` har co-located render-test: utvid for de nye
   fallback/komposisjon-grenene (ingen ny testfil; følg test-disiplin Type C =
   maks én render-test per komponent). Ellers ingen ny test — `catalogParity` +
   `build` + payload-schema dekker korrektheten.

## Out of scope (ikke gold-plate)

- DB-backfill av eksisterende varsel-rader (legacy verbatim, per #573).
- De andre ~17 `notify()`-kallstedene (scan: ingen norsk-komposisjon der).
- Redesign av `registration_rejected`-tittelen for lag-fjerning («Søknad til …»
  er litt rar for en fjerning, men er eksisterende oppførsel — egen sak om noe).
- `reason`-fritekst-feltets eksistens (beholdes for admin-avvisning).

## Avvik / risiko

- `requester_name`/`invited_by_name`/`team_name`/`withdrawn_player_name` går fra
  `min(1)` til nullable — svekker invariant marginalt, men er konsistent med
  `friend_request.actor_name` (#573). Render-tid håndterer null.
- Verifiser at `signup/actions.ts` (individuell `registration_request`) og
  `withdrawActions.ts` (`team_member_withdrew`) sender ekte string-navn —
  nullable aksepterer string, så ingen brudd, men bekreft under bygg.
