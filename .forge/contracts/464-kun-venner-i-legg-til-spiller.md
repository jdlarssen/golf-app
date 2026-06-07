# Spec: Picker-kilde følger kontekst — «legg til spiller» viser venner / klubbmedlemmer, aldri hele brukerbasen (#464)

**Issue:** [#464](https://github.com/jdlarssen/golf-app/issues/464)
**Branch:** `claude/tender-mahavira-4c9d72`
**Type:** feat (område: admin — games-veiviser + liga)
**Versjon:** minor → `1.85.0` (bruker-synlig: hvem som dukker opp i «legg til spiller» endres på tvers av kompis/cup/klubb/liga)

## Problem

Når en arrangør legger til folk som allerede har konto, viser plukk-listene i dag **hele brukerbasen**:
- **Liga «legg til deltakere»** ([`app/admin/liga/[id]/page.tsx:62-65`](app/admin/liga/[id]/page.tsx)) henter `getNewGameFormData().players` = alle brukere.
- **Opprett-spill-veiviseren** ([`PlayersSection`](app/admin/games/new/sections/PlayersSection.tsx)) søker i `players`-proppen = hele rosteren for *alle* intents (kompis/klubb/cup/solo). En kompis-only `FriendQuickAdd`-rad finnes, men hoved-søket viser fortsatt alle.

Liga-**opprett** gjør det allerede riktig ([`app/admin/liga/new/page.tsx`](app/admin/liga/new/page.tsx) → `getFriendPlayerOptions`). Issuet retter resten: picker-kilden skal følge konteksten, ikke eksponere hele basen.

## Prior Decisions (avklart med eier i denne runden + arvet)

- **kompis + cup + liga(legg-til) → venner.** (#369-venneinfra finnes; `getFriendPlayerOptions`/`getFriendIds` ferdig.)
- **klubb → klubbmedlemmer** når en klubb er valgt i `ClubPicker` (`state.groupId`). Klubb-medlemskap (`group_members`) ER relasjonen.
- **Solo:** intentens framtid (admin-only-synlighet / fjerning + solo/team-format-skille) er **egne issues** ([#477](https://github.com/jdlarssen/golf-app/issues/477), [#478](https://github.com/jdlarssen/golf-app/issues/478)). I #464 lar vi solo-pickeren stå **uendret**.
- **«Cup/liga tilgjengelig for klubb»** krever ny schema (`group_id` på `tournaments`/`leagues`) + nytt opprett-steg — **eget epos** (klubb-liga er allerede merket «Fase 3» i `0080`). Ikke i #464.
- **Auto-vennskap ved e-postaksept:** utsatt til **eget issue** (krever invitasjon→inviterer-sporing; picker-add er allerede venner, så gevinsten ligger kun på e-post-stien).
- **E-postinvitasjon uendret:** games inviterer ikke-venner via e-post på spill-detaljsiden (post-opprettelse, ikke veiviseren); liga bootstrapper via vennekode (`/profile/venner`). Ingen nye e-post-felt legges til.
- Picker viser **aldri** e-post for andre brukere (#435) — vennelista og klubbmedlem-lista er e-post-frie.

## Design

### 1. Ren funksjon: kilde-utvelging (Type-A-kjernen)

Ny ren modul `lib/wizard/selectablePlayers.ts`:

```ts
type Ctx = {
  intent: Intent;                              // 'kompis' | 'klubb' | 'cup' | 'solo'
  groupId: string;                             // '' = «Ingen klubb»
  players: PlayerOption[];                     // full/merged roster (superset)
  friendIds: ReadonlySet<string>;
  clubMemberIdsByClub: Record<string, ReadonlySet<string>>;
};
export function selectablePlayers(ctx: Ctx): PlayerOption[]
```

Regler (filtrerer alltid *innenfor* `players` — beholder rekkefølge):
| intent | groupId | kilde |
|---|---|---|
| `kompis` | – | `players ∩ friendIds` |
| `cup` | – | `players ∩ friendIds` |
| `klubb` | satt + har medlemmer | `players ∩ clubMemberIdsByClub[groupId]` |
| `klubb` | tom/ukjent klubb | `players ∩ friendIds` (trygt fallback — **aldri** hele basen) |
| `solo` | – | `players` uendret (utsatt fjerning) |

Self (arrangøren) er ikke i `friendIds`/medlems-settene, men er allerede håndtert av eksisterende «du er med»-logikk i veiviseren — pickeren er for *andre*. Ikke legg self inn her.

### 2. Klubbmedlem-kilde (ny server-helper)

Ny `lib/clubs/getClubMemberPlayerOptions.ts` (speil `getFriendPlayerOptions`: admin-client, e-post-fri, best-effort → tomt ved feil):

```ts
export async function getClubMemberPlayerOptions(userId: string): Promise<{
  memberIdsByClub: Record<string, string[]>;   // clubId → member user-ids
  options: PlayerOption[];                       // de-dup'ede medlem-rader (e-post-frie)
}>
```
Henter brukerens ikke-utløpte klubber (samme kilde som `getNewGameFormData().clubs`), så `group_members.user_id` for de klubbene, så de brukernes `PlayerOption`-felt (id/name/nickname/hcp_index/pending/gender/level). Returnerer både map-en (til filtrering) og rad-ene (til roster-merge).

### 3. Veiviser-wiring (`GameWizard.tsx`, delt av `/admin/games/new` + `/opprett-spill`)

- Ny prop `clubMemberIdsByClub: Record<string, string[]>` (default `{}`).
- Begge server-sider ([`app/admin/games/new/page.tsx`](app/admin/games/new/page.tsx), [`app/opprett-spill/page.tsx`](app/opprett-spill/page.tsx)) kaller `getClubMemberPlayerOptions(userId)`, **merger `options` inn i roster-en** (dedup på `id`, slik `/opprett-spill` allerede merger venner) og sender `clubMemberIdsByClub`. (Admin-rosteren har alle uansett; non-admin trenger merge-en for at klubbmedlemmer skal vises.)
- I wizard: `const pickList = useMemo(() => selectablePlayers({ intent, groupId, players, friendIds: new Set(friendPlayerIds), clubMemberIdsByClub: …Sets }), [...])`. Send `pickList` til **`PlayersSection`** (pick-lista). **`TeamsAssignmentSection` beholder full `players`** (den må kunne slå opp navn på allerede-valgte spillere uansett kilde).
- **Fjern `FriendQuickAdd`** (komponent + render-blokk ~756-764, 1056-1104): når kompis-pickeren nå *er* vennelista, er hurtig-chips-raden redundant.

### 4. Tom-tilstander

- **kompis/cup, ingen venner:** vis «Du har ingen venner på Tørny ennå. [Legg til venner](/profile/venner)» — speil [`CreateLigaForm.tsx:530-535`](app/admin/liga/new/CreateLigaForm.tsx). (Plasseres i/over `PlayersSection` når `pickList.length === 0` for friends-kontekst.)
- **klubb valgt, ingen andre medlemmer:** kort hint «Ingen andre medlemmer i klubben ennå.»

### 5. Liga «legg til deltakere» → venner

- [`app/admin/liga/[id]/page.tsx`](app/admin/liga/[id]/page.tsx): hent `getFriendPlayerOptions(userId)` (parallelt) og send **det** som `players` til `LigaAddPlayers`. Behold `getNewGameFormData()` kun for `courses` (rundene trenger det). userId via `requireAdmin`/`supabase.auth.getUser()`.
- [`LigaAddPlayers.tsx`](app/admin/liga/[id]/LigaAddPlayers.tsx): tom-tilstanden (`eligible.length === 0`) sier i dag «Alle spillere i systemet er allerede deltakere» — den blir feil med venne-kilde. Erstatt med kontekst-riktig tekst: hvis ingen venner → «Legg til venner»-lenke (`/profile/venner`); hvis alle venner allerede er med → «Alle vennene dine er allerede deltakere.»

## Edge Cases & Guardrails

- **Ikke-venn co-player kan ikke legges via pickeren lenger** — bevisst (issuets kjerne). Dekkes av venneforespørsel/vennekode + e-postinvitasjon (games: detaljside). Ikke regress: e-post-stien røres ikke.
- **klubb uten valgt klubb** → venner, aldri hele basen.
- **Intent-bytte midt i veiviseren** (klient-state) må re-evaluere `pickList` (useMemo-deps på `intent`+`groupId`).
- **Allerede valgte spillere som faller utenfor ny kilde** (f.eks. valgt under kompis, så bytt til klubb): de blir værende i `selectedPlayerIds` og rendres av `TeamsAssignmentSection` (full roster) — ikke fjern valg ved kilde-bytte.
- **Non-admin `/opprett-spill` klubb:** uten roster-merge ville klubbmedlemmer som ikke er co-players forsvinne → derfor merges `options` inn. E-post-fri (#435).
- **Performance:** `getClubMemberPlayerOptions` kjører parallelt med eksisterende fetch-er (`Promise.all`), ikke serielt.

## Key Decisions

- **Filtrering som ren funksjon, ikke inline:** testbar (Type-A), én sannhetskilde for alle intents/begge veiviser-flater.
- **Filtrer `players`-superset i klienten** framfor å sende separate lister per intent: intent byttes klient-side, så all kandidat-data må være tilstede; filtrering er gratis og unngår re-fetch.
- **Fjern `FriendQuickAdd`** framfor å beholde: redundant når pickeren er friends-only for kompis.
- **klubb-uten-klubb → venner** (ikke hele basen, ikke tomt): trygt og i tråd med issuets prinsipp.

**Claude's Discretion:**
- Eksakt plassering/markup for tom-tilstandene (gjenbruk eksisterende `text-muted`/`text-[12px]`-mønstre).
- Om medlems-map-et bygges i `getClubMemberPlayerOptions` vs. utvides på `getNewGameFormData` — velg minste diff som holder `/opprett-spill`-cachen (`includeEmail`-primitiv) intakt; ny separat helper er tryggest.
- Om `friendIds`/medlems-sett konverteres til `Set` i wizard eller i ren-fn-signaturen.

## Success Criteria

- [ ] `lib/wizard/selectablePlayers.ts` finnes; `selectablePlayers.test.ts` (Type-A, `it.each`) dekker: kompis→venner, cup→venner, klubb+klubb→medlemmer, klubb-uten-klubb→venner, solo→uendret, tom-venner→[], tom-medlemmer→[]. `npx vitest run lib/wizard/selectablePlayers` grønt.
- [ ] Veiviser-steg 4 (`PlayersSection`) viser **kun venner** for `intent==='kompis'` og `intent==='cup'`, **kun klubbmedlemmer** for `intent==='klubb'` m/ valgt klubb. Verifisert i kode (pickList-wiring) + Playwright (kompis-picker har ikke ikke-venn-bruker).
- [ ] `FriendQuickAdd` er fjernet (komponent + render). `grep FriendQuickAdd` = tomt.
- [ ] Liga `[id]` «Legg til deltakere» lister kun venner (kilde = `getFriendPlayerOptions`), ikke hele rosteren. Verifisert i `page.tsx`-diff.
- [ ] Tom-tilstand: friends-kontekst uten venner viser `/profile/venner`-lenke (veiviser + LigaAddPlayers); klubb uten andre medlemmer viser hint.
- [ ] `getClubMemberPlayerOptions` returnerer e-post-frie options + `memberIdsByClub`; begge veiviser-server-sider merger options inn i roster + sender `clubMemberIdsByClub`.
- [ ] `npx tsc --noEmit` + `npm run build` grønt; co-located tester for endrede filer; versjon `1.85.0` + CHANGELOG-oppføring.

## Gates

- [ ] `npx tsc --noEmit` (full — ny prop + intent-typer treffer exhaustive maps)
- [ ] `npm run build` (Vercel-paritet)
- [ ] `npx vitest run lib/wizard/selectablePlayers` + co-located tester for hver endret `*.ts/.tsx` med egen `*.test`
- [ ] Playwright (frontend rørt): kompis-veiviser steg 4 viser kun venner; klubb m/ valgt klubb viser medlemmer

## Files Likely Touched

- `lib/wizard/selectablePlayers.ts` (ny ren fn) + `lib/wizard/selectablePlayers.test.ts` (ny)
- `lib/clubs/getClubMemberPlayerOptions.ts` (ny helper, speil `getFriendPlayerOptions`)
- `app/admin/games/new/GameWizard.tsx` — `pickList`-useMemo til `PlayersSection`, fjern `FriendQuickAdd`, tom-tilstander, ny prop `clubMemberIdsByClub`
- `app/admin/games/new/page.tsx` — hent klubbmedlemmer, send prop
- `app/opprett-spill/page.tsx` — hent klubbmedlemmer, merge inn i roster, send prop
- `app/admin/liga/[id]/page.tsx` — `getFriendPlayerOptions` som kilde for `LigaAddPlayers`
- `app/admin/liga/[id]/LigaAddPlayers.tsx` — kontekst-riktig tom-tilstand
- `package.json` + `CHANGELOG.md` (bump `1.85.0`)

## Out of Scope (egne issues)

- **Klubb-scopet cup + klubb-liga** (`group_id` på `tournaments`/`leagues` + klubb-vs-venner-valg i opprett + medlems-sourcing der) — [#480](https://github.com/jdlarssen/golf-app/issues/480) (epos).
- **Solo-intent** (admin-only-synlighet / fjerning + solo/team-format-skille) — eksisterende [#477](https://github.com/jdlarssen/golf-app/issues/477) + [#478](https://github.com/jdlarssen/golf-app/issues/478). I #464 står solo-pickeren **uendret**.
- **Auto-vennskap ved e-postaksept** — [#481](https://github.com/jdlarssen/golf-app/issues/481).
- E-postinvitasjons-flyten (uendret: games via detaljside, liga via vennekode).
- Hard sperre / endring av `accepted_at`-modellen (#463 — separat).

## Bygge-rekkefølge (chunks, atomiske commits, alle `Refs #464`)

1. `selectablePlayers.ts` ren fn + Type-A-tester (TDD).
2. `getClubMemberPlayerOptions.ts` helper (+ test om verdt det / dekkes av integrasjon).
3. GameWizard-wiring: `pickList` til PlayersSection, fjern FriendQuickAdd, tom-tilstander; begge server-sider henter+merger+sender prop.
4. Liga add-players → venner + tom-tilstand.
5. CHANGELOG + bump `1.85.0` (feat-commit bærer bumpen).
