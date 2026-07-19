# Spec: #1293 — Reaksjons-chips + palett bak én reager-knapp

## Problem

Eier-feedback fra prod-runde 2026-07-19: reaksjons-stripen (#943) rendrer alle 6
emoji-knapper alltid synlig per spiller. På et 3-spiller solo-podium wrapper stripen
til et 2×3-rutenett under hvert smale podiumkort — 18 store sirkler som dominerer
skjermen. Eiers ord: «Emojiene er også litt for 'tar for mye plass'.» Løsningen er
WhatsApp/Slack-mønsteret: vis kun gitte reaksjoner som kompakte chips, og gjem hele
paletten bak én reager-knapp.

## Research Findings

Ingen ekstern bibliotek-research nødvendig — hele endringen lever i eksisterende,
battle-testet kode. Funn fra kodebase-scout (denne økten):

- **Endringen er sentralisert i ÉN fil.** `RowReactions.tsx` er den delte
  presentasjons-primitiven; alle 18 flater (9 `*View` + 9 `*Podium`) konsumerer den
  via `RowReactionsForPlayer`-connectoren (`RowReactionsForPlayer.tsx:16-29`).
  Props-kontrakten (`counts`, `mine`, `onToggle`, `disabled`) endres ikke →
  ingen av de 18 call-sitene eller connectoren røres.
- **All state bor i provideren.** `ReactionsProvider.tsx` eier optimistisk toggle +
  realtime-refetch; `RowReactions` er «pure function of its props»
  (`RowReactions.tsx:30-34`). Ekspandert/kollapset er ren presentasjons-state og kan
  bo lokalt i komponenten uten å bryte kontrakten.
- **jsdom implementerer ikke popover-API-et** (grep `showPopover` i
  `node_modules/jsdom/lib` = 0 treff). En native-popover-løsning kunne dermed ikke
  verifiseres i vitest/jsdom — og preview-MCP kan ikke drive React-interaksjoner
  (#1219), så jsdom fireEvent er primær-verifikasjonen for interaksjonen.
- **Ingen popover-primitiv finnes i `components/ui/`.** Nærmeste er `Disclosure`
  (native `<details>`), men den er bygget for skjema-seksjoner med tittel/summary og
  passer ikke en emoji-rad.
- **Eksisterende i18n-nøkler** under `leaderboard.reactions`: `clap/fire/laugh/
  strong/golf/birdie`, `groupLabel`, `toggle`, `toggleActive` — nye nøkler for
  trigger-knappen legges i samme namespace (begge locales).

## Prior Decisions (fra kontrakt #943)

- **Delt primitiv, ikke duplisering (#598-mønsteret):** redesignet skjer INNE i
  `RowReactions`; visningene arver automatisk. Gjelder fortsatt.
- **Kontrollert komponent:** counts/mine/optimistisk state eies av
  `ReactionsProvider` — fredet i denne endringen (issue-ramme).
- **Toggle-modell** (Slack-stil, én per (bruker, mål, emoji)), self-reaksjon OK,
  palett-lås i DB — alt uendret; ingen DB/RLS/action-endring.
- **Test-disiplin:** `RowReactions.test.tsx` er komponentens oppførselsfil (4 tester
  i dag) — den skrives om for ny interaksjon. Format-visningstestene forblir grønne
  ved konstruksjon (ingen API-endring).

## Design

### Kollapset (default)

- Emojis med `count > 0` rendres som **chips**: samme knappestil som i dag
  (emoji + `tabular-nums`-telling, `aria-pressed`, min 44×44px). **Tap på chip =
  direkte toggle** — gitte reaksjoner er både synlige OG togglebare uten ekstra tap.
- I tillegg: **én reager-knapp** (trigger) — utlinjet smiley-pluss som inline SVG
  (ingen ny dependency), min 44×44px, `aria-expanded={false}`, `aria-label` fra ny
  i18n-nøkkel.
- Kort/rad uten reaksjoner viser dermed **nøyaktig én knapp** (triggeren).

### Ekspandert

- Tap på trigger → hele 6-emoji-paletten rendres inline (samme 44px-knapper med
  telling som i dag); trigger får `aria-expanded={true}` og fungerer som lukk.
- Valg av emoji i paletten → `onToggle(emoji)` + **auto-kollaps** tilbake til chips
  (WhatsApp-mental-modell: velg én, ferdig).
- Re-tap på trigger → kollaps uten handling. Ingen outside-click-håndtering
  nødvendig (inline ekspansjon, ikke overlegg).
- Ekspansjons-state = lokal `useState` i `RowReactions` (kun presentasjon).

**ASSUMPTION (delegert av eier):** *ekspandert rad* valgt over popover.
Begrunnelse: (a) podium-kolonnene er ~110px på 375px-viewport — en forankret
popover med 6×44px-mål krever portal/fixed-posisjonering + z-index +
outside-click-kompleksitet; (b) jsdom implementerer ikke popover-API-et, så
popover-varianten kunne ikke verifiseres i vitest (#1219 blokkerer
preview-MCP-verifikasjon); (c) ingen eksisterende popover-primitiv å gjenbruke.
Inline-ekspansjonen er transient og gjelder kun kortet brukeren tappet.

### disabled

Som i dag: alle knapper (chips + trigger) `disabled`; paletten kan ikke åpnes.
Chips forblir synlige (lesbar historikk).

## Edge Cases & Guardrails

- **Alle 6 emojis har count > 0:** 6 chips + trigger (7 elementer) — sjeldent,
  wrapper som i dag med `flex-wrap`. Akseptabelt; ikke bygg spesialtilfelle.
- **Realtime-oppdatering mens paletten er åpen:** counts flyter gjennom props
  (pure component) — paletten forblir åpen med oppdaterte tall. OK.
- **Optimistisk untoggle via chip → count når 0:** chipen forsvinner (provider
  sletter 0-counts) — korrekt, det er dagens semantikk.
- **Flere rader ekspandert samtidig:** tillatt (lokal state per rad) — ingen
  koordinering, ingen global «kun én åpen»-regel.
- **Layout-skift ved ekspansjon:** inline-ekspansjon dytter innhold under seg —
  transient og bruker-initiert, akseptabelt. Ingen ny animasjon påkrevd; legges
  transition til må den ha `motion-reduce`-guard (globals.css-konvensjonen).
- **Ingen 0-støy:** counts vises fortsatt kun > 0 (uendret).

## Key Decisions

- **Mønster A — chips + én knapp OVERALT** (podiumkort OG flate rader) — *valgt av
  eier 2026-07-19 i denne økten*. Én konsistent interaksjon; endringen bor uansett i
  den delte primitiven, så A er også den enkleste implementasjonen.
- **Rammer fra issuet (fredet):** alle tap-mål ≥ 44px også i åpnet palett;
  per-spiller-semantikk beholdes; `ReactionsProvider`/optimistisk+realtime røres ikke.
- **Chip-tap = direkte toggle** — oppfyller «gitte reaksjoner synlige uten ekstra
  tap» og gir rask +1 på eksisterende reaksjon.
- **Auto-kollaps etter palett-valg** — holder default-tilstanden kompakt.
- **Ekspandert rad, ikke popover** — se ASSUMPTION over.
- **fix → patch-bump + CHANGELOG Feilrettinger-linje** — UX-fix på eksisterende
  funksjon etter eier-feedback, ikke ny funksjon.

**Claude's Discretion:**
- Trigger-ikonets nøyaktige utforming (smiley-pluss vs. «+») og plassering
  (før/etter chips-raden).
- Justering (sentrert under podiumkort vs. venstrejustert på flate rader) — velg
  det som ser roligst ut uten å endre call-sites; wrapper-klassen i `RowReactions`
  kan f.eks. bruke `justify-center` betinget av eksisterende container, eller
  beholde én nøytral variant overalt.
- Navn på nye i18n-nøkler (f.eks. `open`/`close` under `leaderboard.reactions`),
  begge locales, humanizer-sjekket.
- Om triggeren skjules når raden er `disabled` og tom (null knapper) — vurder mot
  konsistens.

## Success Criteria

- [ ] **Kollapset default:** rad/kort uten reaksjoner rendrer nøyaktig ÉN knapp
      (trigger, `aria-expanded=false`). **Bevis:** `RowReactions.test.tsx` +
      staging-skjermbilde av 3-spiller-podium.
- [ ] **Chips:** emojis med count > 0 vises med telling i kollapset tilstand, og
      chip-tap kaller `onToggle` direkte (uten å åpne paletten). **Bevis:** jsdom
      fireEvent-test.
- [ ] **Palett:** trigger-tap viser alle 6 emojis; valg kaller `onToggle` og
      kollapser; alle knapper (chips, trigger, palett) har `min-h-[44px]
      min-w-[44px]`. **Bevis:** fireEvent-test + klasse-assert.
- [ ] **disabled:** ingen interaksjon mulig; chips synlige. **Bevis:** test.
- [ ] **Isolasjon:** `git diff --name-only main...HEAD` viser INGEN endring i
      `ReactionsProvider.tsx`, `RowReactionsForPlayer.tsx`, `actions.ts`,
      `lib/games/reactions/`, `supabase/` eller de 18 view/podium-filene.
      **Bevis:** diff-listing i evalueringen.
- [ ] **Staging-klikkrunde** av berørt flyt (podium + live-liste på ferdig/aktivt
      spill): åpne palett → toggle → chip vises → untoggle. **Bevis:**
      Playwright-via-Bash (preview-MCP kan ikke drive React-interaksjoner, #1219)
      + bevis-kommentar + `staging-verified`-label på PR-en. Hvis Playwright-driving
      feiler: `needs-manual-qa`-label + notat om hva som gjenstår.

## Gates

- [ ] `npx tsc --noEmit` og `npm run build` grønne
- [ ] `npm run lint` grønn
- [ ] `npx vitest run "app/[locale]/games/[id]/leaderboard/"` — hele suiten grønn
      (38+ filer; format-testene skal være grønne ved konstruksjon)
- [ ] Ny norsk copy (aria-labels) gjennom humanizer-sjekk før commit
- [ ] `fix` → patch-bump av `package.json` + én Feilrettinger-linje i `CHANGELOG.md`

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/RowReactions.tsx` — chips + trigger + palett
- `app/[locale]/games/[id]/leaderboard/RowReactions.test.tsx` — omskrevne
  oppførselstester (samme fil, fortsatt komponentens eneste testfil)
- `messages/no.json` + `messages/en.json` — trigger-nøkler under
  `leaderboard.reactions`
- `package.json` + `package-lock.json` + `CHANGELOG.md` — patch-bump + linje

## Out of Scope

- `ReactionsProvider`, server-actions, `lib/games/reactions/`, DB/RLS/palett —
  fredet av issuet, null endring.
- De 18 view/podium-filene og `RowReactionsForPlayer` — arver via connectoren.
- Lag-scramble/matchplay-reaksjoner — fortsatt egen oppfølging (fra #943).
- Generell popover-primitiv i `components/ui/` — ikke bygg for ett bruk.
- Count-only realtime-optimalisering — fortsatt utsatt (#943).

## Autonomi-notat (nattkjøreren)

`autonomy:ready` settes på issuet. **Planleggings-constraint: kjør ALDRI samme natt
som #1290 del B** — begge rører leaderboard-katalogen
(`app/[locale]/games/[id]/leaderboard/`), og to samtidige branches i samme katalog
gir rebase-konflikter (jf. nattkjører-regelen om å aldri køe to ready-issues som
rører samme kildefiler).
