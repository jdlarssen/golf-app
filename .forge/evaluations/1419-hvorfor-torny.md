# Evaluering: /hvorfor-torny (#1419) — branch `claude/1419-hvorfor-torny`

**Verdikt: ACCEPT**

Evaluert 2026-08-11 mot `.forge/contracts/1419-hvorfor-torny.md`, med
`docs/superpowers/specs/2026-07-31-hvorfor-torny-mockup.html` (v3) som fasit for
struktur og norsk copy. Diff-grunnlag: `95d43987..HEAD` (3 commits: `7abf0fb6`
refactor, `f200f190` feat, `af481177` docs). Alle kommandoer kjørt ferskt i denne
økten (Node 22).

## Suksesskriterier

| # | Kriterium | Status | Bevis |
|---|---|---|---|
| 1 | Anonym GET `/hvorfor-torny` og `/en/hvorfor-torny` → 200 uten login-redirect | **PASS** | `npm run build` (exit 0) + `npx next start -p 3211`; curl anonymt: `/hvorfor-torny → 200`, `/en/hvorfor-torny → 200`, kontroll-rute `/profile → 307 → /login?next=%2Fprofile` (gaten er aktiv, sida er bevisst unntatt). Body inneholder «Dette får du i Tørny». |
| 2 | Innlogget besøkende ser sida MED bunn-nav | **DEFERRED-TO-STAGING** | Krever staging-klikk + skjermbilde. Mekanismen er på plass: `proxy.ts:57` — `hvorfor-torny` i `AUTH_OPTIONAL_PATH_PATTERN`, ikke PUBLIC. |
| 3 | Struktur matcher mockup v3: 9 seksjoner, 8 matriserader, 3 FAQ | **PASS** | `app/[locale]/hvorfor-torny/page.tsx` har alle 9 seksjoner i mockup-rekkefølge (nummererte kommentarer 1–9, linje 129–349). Bygget HTML (`.next/server/app/no/hvorfor-torny.html`): 8 × `<tr class="border-t border-border">`, 3 × `<dt>`, 4 stat-fliser i `grid grid-cols-2`. Skjermbilde side-om-side gjenstår på staging. |
| 4 | Norsk copy identisk med mockupen | **PASS** | Full streng-for-streng-diff mockup → `messages/no.json` `whyTorny.*`: hero, alle 4 fliser (inkl. `\n`-linjeskift ↔ mockupens `<br>`), matrise-heading + alle 8 rader + kolonnetitler, tavle (tittel/Live/3 rader/3 chips), 3 ikon-punkter + sitat (pre/gold/post), 3 FAQ q+a, slutt-CTA, 5 bunnlenker — alt ordrett. Bygget HTML bekreftet: 38 stikkprøve-strenger, 0 mangler. (Sekundær-CTA-ens «→» legges på av `TextLink` som dekor — synlig tekst identisk med mockupens «Eller kom i gang på ordentlig →».) |
| 5 | JSON-LD: FAQPage identisk med synlig FAQ; ingen WebSite/Organization | **PASS** | Bygget HTML parset: `@graph`-noder = `WebPage, FAQPage` (kun); FAQPage.mainEntity strukturelt lik `whyTorny.faq` (`true` på deep-equal); ingen WebSite/Organization-noder — WebSite refereres via `isPartOf` (`page.tsx:107`). Identiteten er også per konstruksjon (samme array mater begge) og låst av render-testen. |
| 6 | Grep «gamebook \| for alltid» tomt | **PASS** | `git diff 95d43987..HEAD \| grep -i "gamebook"` → tomt (exit 1); samme for `for alltid\|forever`. Bygget HTML begge locales: alle tre mønstre `false`. Commit `af481177` omformulerte en doc-kommentar som selv siterte vaktfrasen — nå rent. |
| 7 | Sitemap begge locale-URL-er; `sitemap.test.ts` grønn | **PASS** | Servert `/sitemap.xml` inneholder `https://tornygolf.no/hvorfor-torny` som entry med `hreflang="en" href="…/en/hvorfor-torny"` + `no` + `x-default`-alternates — samme mønster som filas øvrige flate sider (en-varianter rir som alternates, jf. doc-kommentaren i `app/sitemap.ts`). Test utvidet (`app/sitemap.test.ts:59`) og grønn. |
| 8 | Forsiden har bunnlenke til sida | **PASS** | `AnonLanding.tsx:320`: `<FooterLink href="/hvorfor-torny">{t('footer.whyTorny')}</FooterLink>`; nøkkel i begge kataloger («Hvorfor Tørny?» / «Why Tørny?»). Runtime-bevis: anonym curl av `/` viser `href="/hvorfor-torny">Hvorfor Tørny?</a>` i rendret footer. (PPR-skallet `no.html` inneholder ikke auth-grenen — forventet; runtime-render gjør.) |
| 9 | Maks ÉN ny render-test; catalogParity grønn | **PASS** | Eneste nye testfil i diffen: `app/[locale]/hvorfor-torny/page.test.tsx` (1 test). `npx vitest run` på page.test + sitemap.test + AnonLanding.test + catalogParity + apostropheParity: **5 filer, 34 tester, alle grønne**. |

## Gates

| Gate | Status | Bevis |
|---|---|---|
| `npm run build` | **PASS** | Exit 0; begge locales prerendret statisk (`.next/server/app/{no,en}/hvorfor-torny.html`). |
| `npm run lint` | **PASS** | 0 errors, 55 warnings — **ingen** i berørte filer (grep på hvorfor-torny/marketing-primitives/AnonLanding/sitemap/proxy → tomt). |
| Berørte co-located tester | **PASS** | 34/34 grønne (se kriterium 9). |
| Commit-body `Refs #1419` | **PASS** | Alle tre commits bærer `Refs #1419`. |
| PR-body `Closes #1419` + Fordeler/ulemper | **IKKE OPPRETTET ENNÅ** | `gh pr list --head claude/1419-hvorfor-torny --state all` → tom. PR-opprettelse er hovedøktas steg etter ACCEPT — ikke et funn mot bygget. |
| Staging-bevis + `staging-verified`-label før merge | **DEFERRED-TO-STAGING** | Hører til merge-porten (#1076), ikke lokal evaluering. |
| Ingen produktvalg gjenstår | **PASS** | Arbeidet følger godkjent mockup v3 én-til-én; skjønnsrommet i kontrakten (delt modul-navn, nøkkelstruktur, emoji-ikoner) er brukt innenfor rammene. |

## Harde copy-vakter

- **App-framing:** FAQ-svaret («Nei, ingen må. Alle kan bli med rett fra
  nettleseren. Vil du ha Tørny som app, legger du den på hjemskjermen.») og
  en-motstykket hevder aldri at ingen app finnes — holder etter #1276-lansering. PASS.
- **Aldri «for alltid»/forever:** fraværende i diff, kataloger og bygget HTML. PASS.
- **Ingen konkurrentnavn:** `gamebook` (case-insensitivt) fraværende i hele diffen
  og begge bygde HTML-varianter; en-katalogen holder samme myke fraser
  («Needs a subscription», «Varies»). PASS.

## Refactor-sikkerhet (AnonLanding → marketing-primitives)

`7abf0fb6` er verifisert som ren flytting: klasse-strengene i `SectionHeading`,
`TextLink` og `FooterLink` i `app/[locale]/marketing-primitives.tsx` er byte-like
med de slettede lokale hjelperne (lest mot diffen). Commitens eneste
`hvorfor-torny`-treff er kommentarer; selve footer-lenka landet i feat-commiten.
`AnonLanding.test.tsx` grønn. Fila i `app/[locale]/` blir ikke rute (ikke et
reservert filnavn) — bekreftet av rutelista i build-outputen.

## Test-disiplin

- Én ny Type C-render-test; den asserterer testid + JSON-LD↔katalog-identitet, ingen
  copy-literaler (mockup-teksten eies av katalogen). PASS.
- `f200f190` bumper minor (1.231.2 → 1.232.0, feat → minor ✓) og bærer
  CHANGELOG-Funksjon-raden «1.232 · Hvorfor Tørny?» i samme commit. PASS.

## Funn

Ingen blokkerende funn. Tre kosmetiske observasjoner, ingen krever handling:

1. `app/[locale]/hvorfor-torny/page.tsx` + kriterium 3 (struktur): «Andre
   apper»-kolonnen er `w-[92px]` mot mockupens 96px — Tailwind-tilpasning uten
   synlig effekt på mobilbredde.
2. `app/[locale]/hvorfor-torny/page.tsx` + kriterium 4 (copy): to sr-only-strenger
   (`matrix.featureCol` «Funksjon», `matrix.yesLabel` «Ja») finnes ikke i mockupen —
   rene tilgjengelighets-tillegg, usynlige.
3. `messages/en.json` + kriterium 4: en-oversettelsen bryter linjer litt annerledes
   i flis-labels enn no — innenfor kontraktens «oversett etter intensjon».

## Ikke verifisert lokalt (staging-økta tar disse)

- Innlogget klikk-gjennom med bunn-nav (kriterium 2).
- Side-om-side-skjermbilde mot mockupen (bevisformen i kriterium 3).
- Staging-bevis-kommentar + `staging-verified`-label før merge.
