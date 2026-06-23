# Spec: «Inviter spillere» på detaljsiden venne-scopes (server-håndhevet)

**Issue:** [#906](https://github.com/jdlarssen/golf-app/issues/906) — `bug, security, area:admin`
**Branch:** `claude/dazzling-robinson-946c3d`
**Bump:** `fix` → patch (1.140.5 → 1.140.6), CHANGELOG nestet under åpen `## 1.140.y`-serie.

## Kontekst

«Legg til spiller»-flyten på spill-detaljsiden lar en oppretter legge til **hvilken som helst**
registrert bruker — ikke bare venner/klubbmedlemmer. Venne-policyen fra #464 ble bare anvendt på
opprett-veiviseren (`selectablePlayers`/`getClubMemberPlayerOptions`); den delte server-actionen
`addExistingPlayerToGame` (og e-post-grenen i `inviteEmailToGame`) tar imot en vilkårlig
`recipient_user_id` uten kvalifiserings-sjekk (AGENTS.md felle #3 — server er den egentlige authz).

To UI-flater deler actionen:
- `/admin/games/[id]` → `InviteToGameSection` (henter **alle** profilerte brukere). **Admin-only** rute
  (`requireAdmin`), så den sees bare av global admin.
- `/games/[id]/spillere` → `getTeamCandidates` (allerede scopet til venner ∪ co-players). Brukes av
  ikke-admin oppretter (#429).

Den reelle hullet: en **ikke-admin oppretter** kan legge en vilkårlig bruker til sitt eget spill via
den delte actionen / et direkte kall.

## Eier-beslutninger (avklart 2026-06-23)

1. **Scoping gjelder KUN ikke-admin oppretter.** Global admin (Sekretariatet) er unntatt —
   kurator-modellen, samme unntak som disposable-email-guarden (#422,
   `if (!ctx.isAdmin && …)`). Følge: `InviteToGameSection` (admin-only) trenger **ingen** scoping —
   admin ser fortsatt alle, hvilket er korrekt.
2. **Håndheving på action-laget nå; RLS-laget utsettes.** Server-actionen er appens eneste skrivevei,
   så action-guarden dekker 100 % av reell bruk. RLS-laget (defense-in-depth mot forged-JWT direkte
   PATCH, felle #3) files som eget oppfølgings-issue. Begrunnelse for proporsjonalitet: en uoppfordret
   add skjer pre-start, er reverserbar, og gir ingen rettighets-eskalering.

## Design

### Kvalifiserings-resolver (ett hjem for regelen — felle #4)

Ny `lib/games/inviteEligibility.ts`:

```ts
getInviteEligibleIds(creatorUserId: string, groupId: string | null): Promise<Set<string>>
```

Eligible = `getFriendConnectionIds` (akseptert + pending, begge retninger)
∪ `getCoPlayerIds` ∪ klubbmedlemmer av `game.group_id` (kun når satt). Oppretteren selv tillates
alltid av call-siten (egen `=== inviterUserId`-sjekk), ikke i settet.

Dette er **unionen** av alt de legitime invite-UI-ene tilbyr, så server-guarden aldri avviser en
kandidat en scopet picker viste (felle #4 — lagene er enige). Klubbmedlemmer hentes med admin-client
direkte fra `group_members` (users-RLS skjuler med-medlemmer ellers, jf. `getClubMemberPlayerOptions`).

Best-effort komponent-reads (hver returnerer `[]` ved feil): en transient feil **krymper** settet →
guarden feiler **safe** (avviser, oppretteren kan prøve igjen) i stedet for fail-open.

### Action-håndheving

`addExistingPlayerToGame` og e-post-grenen for eksisterende bruker i `inviteEmailToGame`:

```ts
if (!ctx.isAdmin && recipientUserId !== inviterUserId) {
  const eligible = await getInviteEligibleIds(inviterUserId, game.group_id);
  if (!eligible.has(recipientUserId)) {
    redirect({ href: `${detailPath}?error=invite_not_allowed`, locale });
  }
}
```

- Plasseres etter `loadGameForInvite` (trenger `group_id`) og status/full-sjekkene, før insert.
- `loadGameForInvite` utvides: `GameSnapshot` + select får `group_id`.
- **Ukjent-e-post-grenen i `inviteEmailToGame` guardes IKKE** — å invitere en helt ny e-post er selve
  venne-anskaffelses-stien; mottakeren er ennå ikke i noen graf. (Disposable-guarden #422 dekker den
  grenen for ikke-admin.)

### Feilkode + copy

Ny `invite_not_allowed` i `game.players.errorMessages` (no.json + en.json) — namespacet den
ikke-admin oppretter-flyten `/games/[id]/spillere` faktisk leser. Legges til `ERROR_KEYS`-settet i
`app/[locale]/games/[id]/spillere/page.tsx`. (Admin-namespacet `admin.game.errors` trenger den ikke —
admin trigger den aldri.) Norsk: action-orientert, ikke teknisk.

### Kosmetisk (sekundær i issuet)

`InviteToGameClient.tsx` — `<form>` rundt «+ Legg til» får `shrink-0` + knappen `whitespace-nowrap`
så den ikke brytes til to linjer ved lange spillernavn.

## Suksesskriterier

- [ ] **Resolver finnes:** `lib/games/inviteEligibility.ts` eksporterer `getInviteEligibleIds`, union
      av venne-connections ∪ co-players ∪ klubbmedlemmer (når `groupId`), fail-safe ved feil.
- [ ] **Action-guard (picker):** `addExistingPlayerToGame` avviser en ikke-kvalifisert
      `recipient_user_id` for ikke-admin oppretter med `?error=invite_not_allowed`; admin og self slipper
      gjennom; kvalifisert venn/co-player/klubbmedlem slipper gjennom.
- [ ] **Action-guard (e-post, eksisterende bruker):** samme guard i `inviteEmailToGame` sin
      eksisterende-bruker-gren. Ukjent-e-post-grenen er bevisst u-guardet.
- [ ] **group_id leses:** `loadGameForInvite` + `GameSnapshot` inkluderer `group_id`.
- [ ] **Copy:** `invite_not_allowed` finnes i no.json + en.json (`game.players.errorMessages`) og i
      `ERROR_KEYS` i creator-page; norsk er kjørt gjennom humanizer-vurdering.
- [ ] **Kosmetisk:** «+ Legg til»-knappen brytes ikke ved lange navn (`shrink-0` + `whitespace-nowrap`).
- [ ] **Tester:** `inviteToGameActions.test.ts` dekker: ikke-admin + ikke-kvalifisert → avvist;
      ikke-admin + venn → tillatt; ikke-admin + self → tillatt; admin + ikke-kvalifisert → tillatt
      (kurator-unntak); e-post-grenen eksisterende-bruker ikke-admin + ikke-kvalifisert → avvist.
      Eksisterende ikke-admin happy-path-tester oppdatert så mottaker er kvalifisert.
- [ ] **Oppfølgings-issue** for RLS-laget opprettet (med milestone) før PR-merge.
- [ ] **Bump + CHANGELOG** i samme commit som adferdsendringen.

## Gates

- `npx tsc --noEmit` (grønn)
- `npm run lint` (grønn på berørte filer)
- `npx vitest run "app/[locale]/admin/games/[id]/inviteToGameActions.test.ts"` (grønn)
- Staging klikk-runde: ikke-admin oppretter på `/games/[id]/spillere` får IKKE lagt til en ikke-venn
  (action avviser); en venn/co-player legges til som før.

## Utenfor scope

- RLS INSERT-policy på `game_players` (eget oppfølgings-issue, eier-beslutning 2).
- Endring av creator-flytens UI-scope (`getTeamCandidates`) eller klubb-medlems-forslag i creator-UI.
- Liga/cup tids-vindu-guards (#902-naboer, urelatert).
