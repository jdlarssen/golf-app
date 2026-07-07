# Spec: Klubbside — slå sammen invite-kortene + skjul tomme liga/cup-seksjoner

**Issue:** #1135 · **Branch:** claude/1135-klubbside-invite-kort-og-tomme-seksjoner

## Problem

Klubb-detaljsiden (`app/[locale]/klubber/[id]/page.tsx`) har to slitasjer for reell klubbruk (3 klubber, 17 medlemmer i prod):

1. **To separate invite-kort.** Linje 377–417 rendrer to søsken-`<section>`, begge gated på identisk `isAdmin && !frozen` (linje 377): «Legg til medlem» (e-post-skjema) og «Del klubb-lenke» (kopier-lenke). Begge løser samme jobb — få folk inn i klubben — men er delt i to overskrifter og to kort.
2. **Døde liga/cup-overskrifter for vanlige medlemmer.** Linje 351–365 rendrer `ClubLeaguesSection` + `ClubCupsSection` ubetinget. Når klubben har 0 ligaer/0 cuper (prod: aldri noen) viser hver seksjon bare en overskrift + tomtekst (`ClubLeaguesSection.tsx:37–39,68–69`, `ClubCupsSection.tsx:41–43,72–73`). Et vanlig medlem som verken kan opprette liga eller cup ser da to døde overskrifter klemt mellom medlemslista og «Sett opp runde»-CTA-en.

Ren visning — issuet bekrefter «ingen eier-beslutning berørt, ingen server-hull». Ingen DB-, RLS- eller data-henting-endring; RLS-kommentarene på linje 71–85 forblir korrekte.

## Design

### Del 1 — slå sammen invite-kortene (`page.tsx:377–417`)

1. Erstatt de to `<section>`-blokkene (add-member + join-link) med **ett** `<section className="mb-8">` → **én** uppercase-overskrift → **ett** `<Card>` som inneholder begge affordansene, visuelt adskilt (f.eks. en `border-t border-border` + `pt-4`/`mt-4`-skille mellom e-post-skjemaet og lenke-delen).
2. Behold begge affordansene uendret innvendig:
   - E-post-skjemaet: `form action={addMember}` med skjult `groupId`, `Input` (`emailLabel`/`emailPlaceholder`/`emailHint`, `defaultValue={errorEmail ?? ''}`) og `SubmitButton` (`addMemberButton`/`addMemberPending`).
   - Lenke-delen: `joinLinkDescription`-tekst + `<CopyJoinLinkButton joinUrl={joinUrl} />`.
3. **Ny seksjonsoverskrift.** Innfør én ny i18n-nøkkel under `klubb.room` som paraply-overskrift for det slåtte kortet (anbefalt `inviteHeading`). De gamle `addMemberHeading` («Legg til medlem») og `joinLinkHeading` («Del klubb-lenke») kan gjenbrukes som små in-card-underetiketter så brukeren skiller «på e-post» fra «via lenke», eller fjernes — byggerens valg. Gaten: i18n-katalog-paritet (se punkt 4) og humanizer på ny/endret norsk copy.
4. **i18n-paritet (T2).** All ny/endret nøkkel MÅ legges i BÅDE `messages/no.json` og `messages/en.json` — `messages/catalogParity.test.ts` feiler ellers (identiske leaf-keys kreves). `klubb.room`-blokken ligger rundt `messages/no.json:3646–3653` og speiles i `messages/en.json:3646–3653`. Fjernes en nøkkel, fjern den i begge katalogene.
5. Kjør `humanizer:humanizer`-skillet på den nye norske overskriften før commit (bruker-rettet copy, per CLAUDE.md).

### Del 2 — skjul tomme seksjoner for ikke-opprettere (`ClubLeaguesSection.tsx` + `ClubCupsSection.tsx`)

6. Legg en tidlig-retur i `ClubLeaguesSection` (`ClubLeaguesSection.tsx`, rett etter `const t = useTranslations(...)` på linje 33): `if (leagues.length === 0 && !canCreate) return null;`. Speil i `ClubCupsSection` (`ClubCupsSection.tsx:36`, etter `t`/`tCup`-hookene): `if (cups.length === 0 && !canCreate) return null;`.
7. Rasjonale for predikatet (`canCreate`, ikke `isAdmin`): `canCreate = isAdmin && !frozen` sendes allerede fra `page.tsx:355,363`. Utfall:
   - Vanlig medlem, 0 rader → `null` (fikset — ingen død overskrift).
   - Vanlig medlem, ≥1 rad → lista vises (medlemmer skal se eksisterende ligaer/cuper).
   - Admin (ikke frossen), 0 rader → tomtekst + «Ny liga»/«Ny cup»-knapp (uendret).
   - Admin, frossen, ≥1 rad → lista + «Styr» via `canManage` (uendret); ingen død tomtekst siden `canManage` styrer «Styr» og listen finnes.
   - Admin, frossen, 0 rader → `null` (kan verken opprette eller styre noe — ingenting å vise).
8. Legg gate-logikken **inne i komponentene** (ikke i `page.tsx`), fordi tomtilstand-rendringen allerede bor der og de eksisterende testene rendrer komponentene direkte. `page.tsx:352–365` forblir da uendret for Del 2.
9. **Oppdater de eksisterende tomtilstand-testene** (de koder den GAMLE «vis alltid tomtekst»-oppførselen):
   - `ClubLeaguesSection.test.tsx:57–60` — `canCreate={false}` + `leagues={[]}` skal nå rendre INGENTING (`container.firstChild` er `null` / `queryByText('Ingen ligaer i klubben ennå.')` er `null`). Legg til/juster slik at `canCreate={true}` + `leagues={[]}` fortsatt viser tomteksten + «Ny liga»-knappen.
   - `ClubCupsSection.test.tsx:52–55` — samme mønster med `Ingen cuper i klubben ennå.` / «Ny cup».
   - Per test-disiplin (Type C, maks én render-test per komponent): dette er justering av eksisterende tester til ny intensjon, IKKE nye tester. Ikke legg til flere.

### Levering

10. Bruker-synlig endring → PR-flyt: atomiske commits med `Refs #1135` i body, PR mot `main` med `Closes #1135` i body. Version-bump per commit som er `feat`/`fix`/`perf` (commit-msg-hooken håndhever) — begge delene er UI-polish/subtraksjon, så `fix` + `npm version patch --no-git-tag-version` + én CHANGELOG-linje under **Feilrettinger** (fra `1.183.0`). Commit-granularitet (én samlet eller to atomiske) er byggerens valg; hver `fix`-commit trenger eget bump + Refs.
11. Staging-verifiser den berørte klubb-flaten før merge (bruker-synlig): (a) admin ser ett sammenslått invite-kort med både e-post-felt og kopier-lenke; (b) vanlig medlem i en klubb uten ligaer/cuper ser INGEN liga/cup-overskrift; (c) admin i samme klubb ser fortsatt de tomme seksjonene med «Ny liga»/«Ny cup».

## Key Decisions

- **Del 2-gate = `canCreate`, ikke `isAdmin`.** Følger issuets ordlyd («ikke-tom, eller kun for `canCreate`») og gjør at en frossen admin uten rader ikke får en handlingsløs død seksjon. Frossen admin MED rader ser dem via `leagues.length > 0`.
- **Gate bor i komponenten, ikke call-site.** Tomtilstand-logikken bor allerede i komponenten; testene rendrer komponenten direkte → holder regelen ett sted (trap 4) og `page.tsx` urørt for Del 2.

**Claude's Discretion:** Eksakt norsk tekst på den nye paraply-overskriften (kjør humanizer); om `addMemberHeading`/`joinLinkHeading` beholdes som in-card-underetiketter eller fjernes; det visuelle skillet inne i det sammenslåtte kortet (border-divider vs. spacing); commit-granularitet (én samlet vs. to atomiske).

## Success Criteria

- [ ] Admin (owner/admin, ikke frossen) ser ÉN invite-seksjon med både «legg til på e-post»-skjema og kopier-lenke i samme kort.
- [ ] Vanlig medlem i en klubb uten ligaer OG uten cuper ser verken «Klubbens ligaer»- eller «Klubbens cuper»-overskrift.
- [ ] Vanlig medlem i en klubb MED ≥1 liga/cup ser fortsatt den(e) seksjonen(e) med lista.
- [ ] Admin ser fortsatt liga/cup-seksjonene (tomtekst + «Ny liga»/«Ny cup»-knapp) også når de er tomme, så lenge klubben ikke er frossen.
- [ ] `messages/no.json` og `messages/en.json` har identiske leaf-keys (paritetstesten grønn).
- [ ] De to tomtilstand-testene reflekterer ny oppførsel; ingen nye Type C-tester lagt til.

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx vitest run "app/[locale]/klubber/[id]/ClubLeaguesSection.test.tsx" "app/[locale]/klubber/[id]/ClubCupsSection.test.tsx" messages/catalogParity.test.ts`
- [ ] Staging-verify av klubb-flaten (admin-visning + medlem-visning) før merge

## Files Likely Touched

- `app/[locale]/klubber/[id]/page.tsx` — slå sammen de to invite-seksjonene (linje 377–417) til ett kort.
- `app/[locale]/klubber/[id]/ClubLeaguesSection.tsx` — tidlig-retur `null` når tom og ikke `canCreate`.
- `app/[locale]/klubber/[id]/ClubCupsSection.tsx` — samme tidlig-retur.
- `app/[locale]/klubber/[id]/ClubLeaguesSection.test.tsx` — oppdater tomtilstand-testen.
- `app/[locale]/klubber/[id]/ClubCupsSection.test.tsx` — oppdater tomtilstand-testen.
- `messages/no.json` + `messages/en.json` — ny paraply-overskrift under `klubb.room` (paritet).
- `CHANGELOG.md` + `package.json` (+ `package-lock.json`) — Feilrettinger-linje + patch-bump.

## Out of Scope

- Enhver DB-/RLS-/data-henting-endring — `leagues`/`tournaments`-selectene (`page.tsx:73–85`) og RLS-policyene er urørt; ren visning.
- Redesign av `CopyJoinLinkButton` eller add-member-server-actionen (`addMember`).
- Endring av frossen-klubb-logikken (`isClubExpired`, `frozen`-banneret) eller «Sett opp runde»-CTA-en.
- Nye tester utover å justere de to eksisterende tomtilstand-assertene.
