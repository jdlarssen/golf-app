# Spec: Utroperen — ukentlig lanserings-los med 📣 Publiser-knapp i Discord

**Issue:** #1207 · **Branch:** claude/1207-utroperen-lanserings-los

## Problem

Månedsbrevet (#202) sendes helautomatisk 1. i måneden, men innholdet — lanseringene — publiseres manuelt og i rykk og napp: 5 lanseringer siden mai, mens CHANGELOG-en har ~10 udekkede bruker-synlige funksjoner bare siden 2. juli. Eieren vil ha ukentlig rytme: hver torsdag et Discord-varsel med ukens lanserings-forslag, publiserbart med ett tapp. Uten rutinen glemmes lanseringer, og månedsbrevet mister innhold selv om appen shipper.

## Research Findings

- Discord button `custom_id`: maks 100 tegn (verifisert docs.discord.com 2026-07-10) — en GitHub kommentar-ID (~10 sifre) får god plass i `publish_lansering:<comment_id>`.
- Maks 5 knapper per action row; bot-meldinger via `POST /channels/{id}/messages` støtter `components` — allerede bevist i drift av morgenbriefen.
- Interactions-endepunktet (`app/api/discord/interactions/route.ts`, #1124) har ferdig: ed25519-signaturport, eier-allowlist, deferred-svar + `after()`-follow-up, `GITHUB_LOOP_PAT` (Issues RW — dekker henting av issue-kommentarer via `GET /repos/{o}/{r}/issues/comments/{id}`).
- `product_updates.created_by` er `uuid NOT NULL REFERENCES users(id)` (migrasjon 0035) — endepunktet må slå opp en reell bruker-id.
- Cloud-routines kjører i isolert VM med **kun staging-nøkler** (nattkjøreren-rammene) — rutinen kan IKKE lese prod-`product_updates`. All prod-tilstand må gå via tavle-kommentarer eller endepunktet (som kjører i prod-appen med admin-klient).

## Prior Decisions

- **Loop-mønsteret (#1079/#1080):** primærartefakt = GitHub-kommentar på tavle-issue; Discord-speiling er best-effort og ETTER kommentaren; feilet speiling rapporteres, stopper aldri kjøringen; tom uke gir alltid én melding (stillhet = loopen feilet).
- **#202/#1140:** all publisering går gjennom `publishProductUpdate` (insert + in-app-fanout) og `validateProductUpdateInput` — digest-cronen plukker opp publiserte rader automatisk. Digest-/cron-flyten røres ikke.
- **changelog-conventions.md:** Funksjon-oppføringer bærer de fire Lanserings-feltene (tittel etter «·», body = setningen etter «—» uten `[#N]`-prefiks, `↳ /lenke · «cta»`) nettopp for ett-klikks-publisering.

## Design

### A. Cloud-routine «Utroperen» (torsdag 09:00 Europe/Oslo)

Operativ spec skrives i `docs/loops/utroperen.md` (samme struktur som morgenbriefen: Harde regler / Innhold / Discord-speiling / Heartbeat). Kjernen:

1. **Kilde = CHANGELOG.md på main.** Kandidater er Funksjon-oppføringer som verken er foreslått før (egne tavle-kommentarer) eller publisert (✅-markører fra endepunktet, se B). Feltene løftes **ordrett** fra oppføringen — CHANGELOG-en er humanisert; rutinen forfatter aldri ny copy. Mangler `↳`-linja → foreslå uten lenke/knappetekst.
2. **Kø-modell — maks ÉN per uke.** Alle udekkede Funksjon-oppføringer som består spiller-testen («vil en kompis i en fredagsflight gjøre noe annerledes etter å ha lest dette?») utgjør lanserings-køen. Shipping skjer i rykk; køen er bufferen som drypper funksjonene ut én per uke i stedet for «alt i en smell». Rutinen foreslår den **viktigste** fra køen (ikke nødvendigvis den nyeste), og hver melding viser kø-status («+ N til på lager»). Tom kø → eksplisitt tom-uke-melding, aldri tvangs-lansering.
3. **Post tavle-kommentar** (primærartefakt) på dedikert tavle-issue «Utroperen — lanserings-tavla»: lesbar gjengivelse av forslaget + maskinlesbar fenced ```json-blokk med `{title, body, link, cta_label}`.
4. **Discord-speiling** (bot-token, morgenbrief-mønsteret): forslaget + knapp «📣 Publiser» med `custom_id: publish_lansering:<comment_id>`. Tom uke → «Ingen lansering denne uka — neste kandidat i kø: …». Speilings-feil → noteres, blokkerer aldri.
5. **Månedsbrev-vakt:** tell ✅-markører med denne månedens dato i tavle-tråden; ≥4 → varsellinje («månedsbrevet begynner å bli fullt») men fortsatt forslag — eieren bestemmer. (Manuelle publiseringer utenom Utroperen telles ikke her; endepunktets follow-up gir eksakt DB-telling ved hvert tapp.)
6. **Heartbeat:** forventning registreres i `docs/loops/morgenbriefen.md` (due torsdager; mangler to på rad → infra-issue, standard mønster).

### B. Interactions-action `publish_lansering` (app-kode)

- `lib/loops/discordActions.ts`: nytt `DiscordAction`-medlem `{ kind: 'publish_lansering'; commentId: number }`, `parseCustomId`-regex `^publish_lansering:(\d+)$`, ny `executeAction`-gren.
- Flyt i grenen: hent kommentaren via GitHub REST → trekk ut ```json-blokken → `validateProductUpdateInput` → **dedupe** mot `product_updates` (identisk `title` med `created_at` siste 45 dager → svar «allerede publisert», publiser ikke) → `publishProductUpdate` med `created_by` = oppslag `users.is_admin = true` (eldste; ingen funnet → feilmelding, ikke publiser) → post «✅ Publisert: <tittel> — <ISO-dato>» som svar-kommentar på tavle-issuet (rutinens tilstandssignal) → Discord-follow-up: «📣 Publisert: <tittel> — ute hos N brukere (lansering nr. M i <måned>)» der M telles fra DB.
- In-app-varsling til alle brukere og inklusjon i neste månedsbrev følger gratis med `publishProductUpdate` — ingen digest-endring.
- Commit-disiplin: `feat(loops)` + minor-bump + `[no-changelog]` (eier-intern flate, ikke spiller-synlig — #1124-presedens).

### C. Docs + tavle

- Ny `docs/loops/utroperen.md`; oppdatert `docs/loops/morgenbriefen.md` (heartbeat-forventning + `publish_lansering` i custom_id-lista).
- Tavle-issuet opprettes ved utrulling (hovedchat, ikke PR-en); det skal aldri få forge-kontrakt (kvalifiserer da aldri for natt-køen, samme logikk som #1110-eksklusjonen).
- Selve routine-opprettelsen (torsdag 09:00) gjøres via /schedule-skillet ETTER merge — prompten peker på `docs/loops/utroperen.md` som operativ spec.

## Edge Cases & Guardrails

- **Dobbelt-tapp / retry:** dedupe-sjekken svarer «allerede publisert» — aldri dobbel in-app-blast.
- **Kommentar slettet / 404, JSON-blokk mangler eller validerer ikke:** klar feilmelding i follow-up, ingen publisering, ingen crash (feil fanges allerede av endepunktets try/catch).
- **Norske tegn/anførselstegn i JSON:** blokk-generering på rutine-siden må escape korrekt; parseren på endepunkt-siden tåler whitespace-variasjon.
- **Ikke-eier trykker:** eksisterende allowlist avviser (uendret).
- **Ekstern lenke i forslaget:** `validateProductUpdateInput` avviser (må starte med `/`) — feilmelding, ikke publisering.
- **Månedsskifte:** forslag postet torsdag 31., tappet fredag 1. → lanseringen hører til publiserings-måneden (digest bruker `created_at`) — dokumenteres i utroperen.md, ingen kode.
- **Tavle-issuet må aldri lukkes/bygges** — som #1110.

## Key Decisions

- **V2 med publiser-knapp** — eierbeslutning 2026-07-10.
- **Torsdag 09:00 Oslo** — eierbeslutning; treffer før helgerundene.
- **Copy hentes ordrett fra CHANGELOG.md** — eierbeslutning («Den er humanisert»); rutinen skriver aldri egen bruker-copy.
- **Alltid ukentlig Discord-melding** — eierbeslutning; stillhet skal bety feil.
- **Kø-modell, ikke nyhets-modell** — eierbeslutning 2026-07-10 («vi kan ikke lansere alt i en smell, så ofte kan vi ha litt backup som vi lanserer underveis»): burst-shipping bygger kø; rutinen drypper ut én per uke, viktigste først.
- **Forslag mellomlagres som GitHub-kommentar, ikke DB** — rutinen har ikke prod-tilgang; ingen migrasjon, ingen prod-DDL.
- **Soft månedsbrev-vakt ved 4** — varsle, aldri hard stopp; redaksjonen er eierens.
- **ASSUMPTION:** ingen prefill-lenke til `/admin/lanseringer`-skjemaet — eieren svarte med kilderegel i stedet for A/B; manuell lim-inn fra Discord-meldingen dekker juster-behovet. Noteres som utsatt idé.

**Claude's Discretion:** eksakt JSON-markørformat i tavle-kommentaren; hvordan DB-/publish-avhengigheter wires inn i `executeAction` (signaturutvidelse vs deps-objekt — følg testbarheten i eksisterende `discordActions.test.ts`); feilmeldings-copy i follow-ups; tavle-issuets tittel/body; om dedupe-vinduet er 45 eller 60 dager.

## Success Criteria

- [ ] `parseCustomId('publish_lansering:<id>')` returnerer riktig action; ugyldige varianter → `null` (unit-tester).
- [ ] `executeAction`-grenen: publiserer ved gyldig kommentar (mocket gh + DB), svarer «allerede publisert» ved dedupe-treff uten nytt insert, feiler kontrollert ved 404/manglende JSON/valideringsfeil (unit-tester per gren).
- [ ] Vellykket publisering poster ✅-markør på tavle-issuet og follow-up med mottaker- og måned-telling (assertert i test via mock).
- [ ] `docs/loops/utroperen.md` finnes med Harde regler / Innhold / Discord-speiling / Heartbeat; `morgenbriefen.md` nevner Utroperen-heartbeat (torsdager) og den nye knappen.
- [ ] `lib/productUpdates/`, `app/api/cron/product-update-digest/` og `lib/mail/` er uendret (publish-libben får kun nytt call-site).
- [ ] VERIFICATION GAP (aksepteres): ekte knapp-tapp ende-til-ende kan ikke testes i gates — verifiseres av eieren ved første torsdags-kjøring; PR merkes `needs-manual-qa`.

## Gates

- [ ] `npm run build` — grønt
- [ ] `npx vitest run lib/loops` — grønt (eksisterende + nye tester)
- [ ] `npm run lint` — grønt på berørte filer

## Files Likely Touched

- `lib/loops/discordActions.ts` — nytt action-medlem + parsing + utførelse
- `lib/loops/discordActions.test.ts` — nye grener
- `app/api/discord/interactions/route.ts` — wiring av nye avhengigheter (admin-klient/publish) inn i `executeAction`-kallet + env-doc-kommentar
- `docs/loops/utroperen.md` — ny operativ spec for rutinen
- `docs/loops/morgenbriefen.md` — heartbeat-forventning + custom_id-liste
- `package.json`/`package-lock.json` — minor-bump (`feat`)

## Out of Scope

- Prefill-lenke som åpner `/admin/lanseringer`-skjemaet ferdig utfylt (utsatt idé).
- Endringer i digest-/cron-flyten eller mail-malen.
- Redigering/tilbaketrekking av publiserte lanseringer fra Discord.
- Auto-publisering uten eier-tapp.
- Telling av manuelle publiseringer i rutinens månedsvakt (endepunktet rapporterer eksakt telling ved tapp).
- Selve /schedule-opprettelsen og tavle-issuet (utrullingssteg i hovedchat etter merge, ikke PR-innhold).
