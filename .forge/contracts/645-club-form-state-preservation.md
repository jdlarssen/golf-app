# Forge-kontrakt: #645 — Klubb-skjema beholder felt ved valideringsfeil

**Issue:** [#645](https://github.com/jdlarssen/golf-app/issues/645) — Opprett klubb: skjemaet tømmer alle felt ved valideringsfeil (owner_not_found)
**Branch:** `claude/practical-kepler-bd9c4a`
**Type:** bug (UX-friksjon), `area:admin`

## Problem

Server-action-skjemaer i klubb-flyten redirecter ved valideringsfeil med `?error=<kode>` (og noen ganger `&email=`), men leser ikke verdiene tilbake inn i feltene. Resultat: brukeren må taste alt på nytt selv om bare ett felt (eier-e-posten) var feil.

Rammer to skjemaer:
1. **Opprett klubb** — `app/[locale]/admin/klubber/ny/page.tsx` + `actions.ts`. Felt: `name`, `owner_email`, `member_cap`, varighet (mode + dato via `VarighetField`). Kun `owner_email` echoes i dag (på `owner_not_found`), og den fylles ikke engang tilbake i feltet.
2. **Legg til medlem** — `app/[locale]/klubber/[id]/page.tsx` + `actions.ts`. Felt: `email`. Echoes via `?email=` på `not_found`/`already`, men feltet leser den ikke tilbake.

## Gråsoner — beslutninger

- **Echo-mekanisme:** searchParams-echo (samme mønster som eksisterende `?email=` og `app/[locale]/admin/spillere/actions.ts`). Ikke cookies, ikke client-component-konvertering — holder server-action-grensa og er konsistent med kodebasen. *(Eier delegerer tekniske valg; valgt for konsistens.)*
- **E-post i URL:** allerede dagens oppførsel for `owner_not_found`/`not_found`. Klubbnavn + medlemstak er ikke sensitivt. Akseptert trade-off, ingen endring i personvern-profil.
- **VarighetField:** allerede client-component med `defaultMode`/`defaultDate`-props — echo mode+dato via searchParams og mat inn som defaults.
- **Scope:** begge skjemaer (issue ber eksplisitt om å sjekke «Legg til medlem» også).

## Success-kriterier

- [ ] **K1 — Opprett klubb beholder alle felt.** Ved enhver valideringsfeil-redirect fra `createClubForAdmin` echoes `name`, `owner_email`, `member_cap`, varighet-mode og varighet-dato i searchParams, og `ny/page.tsx` mater dem inn som `defaultValue`/defaults. *Evidens: les page.tsx + actions.ts; verifiser hver `redirect(...)`-gren bærer feltene og hvert `<Input>` har `defaultValue`.*
- [ ] **K2 — Legg til medlem beholder e-post.** `addMember`-feil-redirect echoer `email` (gjør den allerede), og `klubber/[id]/page.tsx` mater `?email=` inn som `defaultValue` på e-post-feltet. *Evidens: file:line på `defaultValue={errorEmail ?? ''}` e.l.*
- [ ] **K3 — Suksess-sti uendret.** Vellykket opprettelse/innmelding redirecter som før (ingen feltene henger igjen i URL etter suksess). *Evidens: suksess-grenene urørt.*
- [ ] **K4 — Ingen lekkasje av feltverdier til andre tilstander.** Echo-paramene leses kun for å pre-fylle ved feil; tom default ellers. *Evidens: `first(sp.x)`-guard.*
- [ ] **K5 — Norsk copy uendret/humanized.** Ingen nye bruker-strenger forventet (kun gjenbruk av eksisterende felt-labels). Hvis noen feilmelding endres → humanizer-pass.

## Gates (scoped til endrede filer)

- `npx tsc --noEmit` (eller `npm run build` hvis nødvendig) — grønt.
- `npm test` — co-lokaliserte tester for endrede filer grønne (om noen finnes).
- `npm run lint` på endrede filer — grønt.

## Notater

- Ingen ny migrasjon, ingen DB-endring.
- Bug-fix → PATCH-bump + CHANGELOG-oppføring (commit-msg-hook krever det for `fix(...)`).
- Test-disiplin: dette er server-action-round-trip-oppførsel (E2E-territorium). Ikke legg til tunge nye tester; verifiser via build + lesning. Maks én liten Type-C-render-test hvis en eksisterende test allerede dekker skjemaet.
