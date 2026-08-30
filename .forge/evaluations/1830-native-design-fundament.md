# Evaluation: #1830 — Native design-fundament (Fraunces/Inter, mørk modus, token-splitt)

**Evaluator:** fresh-context skeptisk evaluator, 2026-08-30 21:54–21:56
**Branch:** `claude/infallible-heyrovsky-d97889` mot `origin/main`
**Metode:** alle kommandoer kjørt av evaluator selv; ingen byggerpåstand overtatt uprøvd.

---

## Kriterium 1 — Fontene lever: **PASS**

**Egen evidens (simulator 820CA940 «iPhone 17 Pro», Release-bygg, bundle no.tornygolf.dev):**

- Bundelen inneholder **nøyaktig 6 TTF-er** — verifisert med `find $(xcrun simctl
  get_app_container … no.tornygolf.dev) -name "*.ttf"`: Fraunces_500Medium,
  Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  Inter_700Bold. Ingen ekstra snitt/kursiver (per-vekt-subpath-importen i `App.tsx:20–25`
  holder). Bundle-mtime `Aug 30 21:48` — bygget er fra denne økta, ikke et gammelt.
- `appearance light` → `terminate` → `launch` → `/tmp/eval-light.png` **lest av meg**:
  spilltitlene («TEST-Cup-1785721366812 – Singel 1», «Byneset North 3. juli») rendres i
  en høykontrast-serif med Fraunces' karakteristiske ball-terminaler og y-descender —
  ikke systemserif, ikke SF. Banelinje («Byneset North»), tidsstempel og badge-tekst
  («Levert», «Fortsett») rendres i en grotesk med Inters rettskårne terminaler.
  Bakgrunn = linen (varm off-white), kort = hvite. Nav-headeren «Tørny Dev» har arvet
  serifen via `ui.title`-verdiendringen — additivt, som ventet.
- Ingen systemfont-blits: se burst-analysen under kriterium 3 — ingen frame viser tekst
  i fallback-font før splashen forsvinner.
- *Bokført avvik godtatt:* Login-skjermen ikke fotografert (ville krevd utlogging av
  e2e-rigg-sesjonen). Hjem + GameHome dekker font-beviset; ikke et kontraktsbrudd.

## Kriterium 2 — Token-splitt additivt: **PASS**

**Egen evidens (`native/app/src/theme.ts` lest i sin helhet, sammenlignet med
`git show origin/main:native/app/src/theme.ts`):**

- Nye eksporter til stede: `Scheme` (l.23), `ThemeColors` (l.26–36), `PALETTES` (l.44–66),
  `FONTS` (l.75–82), `Theme`/`themeFor`/`resolveScheme`/`useTheme` (l.186–210).
- `COLORS` (l.9–20) og `TAP` (l.23) **tegn-for-tegn uendret** fra origin/main.
- `ui`-nøkkelparitet mekanisk verifisert (uttrekk av begge nøkkelsett + `diff`):
  20 nøkler, **IDENTICAL**. Ingen fjernet, ingen ny.
- `git diff | grep '^-' | grep -i export` gir kun `-export const ui = StyleSheet.create({`
  — samme navn beholdt (`export const ui = uiVariants.light`, l.183). **Null fjernede
  eksporter.**
- **Lys palett bit-identisk** — kontrollert rolle for rolle mot `COLORS`:
  bg `#F8F6F0`, surface `#FFFFFF`, border `#E3DFD3`, text/primary `#1B4332`,
  muted `#5C6B60`, onPrimary `#FFFFFF` (= gamle `buttonText.color: COLORS.card`),
  accent `#C9A961`, danger `#B00020`. ✓
- **Mørk palett kontrollert mot `app/globals.css` `[data-theme='dark']` (l.170–199 og
  l.273–290)** — alle åtte treffer eksakt: bg `#14201a` ✓, surface `#1c2a22` ✓,
  border `#2f3f34` ✓, text `#ece5d2` ✓, muted (`--text-muted`) `#9a9180` ✓,
  primary `#7eaa80` ✓, accent `#d4b870` ✓, danger `#d67268` ✓.
  `onPrimary` mørk = `#14201A` = `--bg` — stemmer med `dark:text-bg` på primary/danger
  i `components/ui/Button.tsx:17` og `:20`. ✓
- **`fontWeight`-rester:** `grep -n fontWeight native/app/src/theme.ts` → ett treff, og
  det er en **kommentarlinje** (l.73). Ingen stil beholder `fontWeight` sammen med
  custom familie. ✓
- Font-mapping stemmer med Design: `title`/`value` → serifScore, `sectionTitle` +
  `buttonText`/`buttonSecondaryText`/`badgeText` → sansSemiBold, `body`/`muted`/`error`
  → sans, `linkText` → sansMedium, `num` kun `fontVariant: ['tabular-nums']`. ✓
- `theme.test.ts` låser reelt det kontrakten hevder: lys == COLORS rolle-for-rolle
  (`toEqual` på hele objektet), mørk nøkkelparitet + hver rolle distinkt fra lys,
  `themeFor('light').ui === ui`, nøkkelparitet lys/mørk `ui`, FONTS-navnene,
  `resolveScheme` for `'dark'/'light'/null/undefined/'unspecified'`.

## Kriterium 3 — Mørk modus-mekanismen: **PASS**

**Egen evidens:**

- `native/app/app.json:7` → `"userInterfaceStyle": "automatic"` (var `"light"` — låsen er
  borte). Splash-plugin l.24–33 med `backgroundColor: "#F8F6F0"` + `dark.backgroundColor:
  "#14201A"`.
- Prebuild-colorsettet `native/app/ios/TrnyDev/Images.xcassets/SplashScreenBackground.colorset/Contents.json`
  lest og regnet om: ANY = (0.9725, 0.9647, 0.9412) × 255 = **(248,246,240) = #F8F6F0**;
  dark-appearance = (0.0784, 0.1255, 0.1020) × 255 = **(20,32,26) = #14201A**. Eksakt
  kontraktverdiene, faktisk kompilert inn i bygget. ✓
- `appearance dark` → terminate → launch → burst på 8 skjermbilder. Målte
  gjennomsnittsfarger (1×1-nedskalering) + lesing av frames:
  - frame 1: rgb(17,44,68) — simulatorens springboard, **ikke hvit**
  - frame 2: rgb(8,12,12) — near-black
  - **frame 3 (lest av meg): mørk splash — klubbhus-natt-bakgrunn med splash-ikonet,
    ingen hvit/linen flate noe sted**
  - frame 4/8: rgb(238,238,236) — Hjem-skjermen, lys (ukonverterte skjermer, bokført
    transitional gap → #1833)
  - **frame 8 lest av meg:** full Hjem-liste, Fraunces + Inter, ingen redbox, ingen
    krasj-dialog. Appen booter fint i dark appearance. ✓
  - Ingen frame viser hvit splash-blits, og ingen frame viser tekst i systemfont.
- `useTheme` (l.208–210) bruker **`useColorScheme()`-hooken**, ikke
  `Appearance.getColorScheme()` — re-render ved scheme-bytte er dermed reell
  hook-kontrakt, ikke en engangslesing. ✓
- Appearance satt tilbake til `light` etter testen. ✓

## Kriterium 4 — Gates: **PASS (de jeg kjørte selv)**

Kjørt av meg, Node 22, fra `native/app/`:

- `npx jest` → **12 suiter / 92 tester passed**, `JEST_EXIT=0`
- `npx tsc --noEmit` → `TSC_EXIT=0`

Rot-gates (`npm run build`, vitest, eslint, expo export) ikke gjenkjørt — per
evaluator-instruks; de er logget grønne i hovedøkta og er ikke der jukserisikoen ligger.

## Kriterium 5 — Web-fredning + koordinering: **PASS (kodesiden), én åpen merge-plikt**

- `git diff origin/main --name-only | grep -vE '^(native/app/|docs/native/|\.forge/)'`
  → **NONE**. 8 filer, alle i de tre tillatte sonene.
- `git diff origin/main -- lib/ native/app/src/screens native/app/src/navigation.tsx`
  → **0 linjer**. Ingen skjermfil, ingen `navigation.tsx`, ingen `SyncLab` rørt —
  N4-koordineringen holdt. Endrede filer under `native/app/src/`: kun `theme.ts` +
  `theme.test.ts`.
- Oppfølgings-issue **#1833** finnes og er åpen: «Native — konverter skjermene og
  navigasjonen til useTheme (mørk modus synlig overalt)», milestone «Native app
  (iOS + Android)». ✓
- **Åpen plikt:** ingen PR finnes ennå (`gh pr list --head …` → `[]`), så
  «PR-body lister de nye token-eksportene for N4» er per definisjon ugjort. Dette er en
  merge-tidsplikt for hovedøkta, ikke en byggerdefekt — men den MÅ innfris før merge.

---

## Skjønnsvurdering — leting etter det byggeren kan ha jukset på

| Sjekk | Funn |
|---|---|
| `fontWeight` igjen sammen med custom `fontFamily` | Nei — eneste treff er kommentar (l.73) |
| `useTheme` bruker `Appearance.getColorScheme()` (ville ikke re-rendre) | Nei — `useColorScheme()`-hooken (l.209) |
| Skjermfiler/`navigation.tsx` snikendret | Nei — 0 linjer diff |
| Fjernede eksporter/nøkler i `ui` | Nei — 20/20 nøkler, `diff` IDENTICAL |
| Mørke verdier «omtrent» webbens | Nei — alle 8 eksakte, `onPrimary` følger `dark:text-bg` |
| Splash-colorset kun i app.json, ikke i bygget | Nei — colorsettet er prebuilt med riktige komponenter |
| Bundelen dratt inn hele font-pakkene | Nei — nøyaktig 6 TTF-er |

**Ikke-blokkerende observasjoner (ikke kontraktskrav — ta som oppfølging, ikke som fail):**

1. **`App.tsx` splash-hold, sesjonsgrenen:** `ready = (fontsLoaded || fontsError != null)
   && !booting`. Font-grenen kan ikke henge (kontraktens edge-krav ✓). Men
   `supabase.auth.getSession().then(…)` (l.49–52) har ingen `.catch` — en avvist promise
   lar `booting` stå `true` og **splashen henger evig**. Feilmodusen er arvet fra
   origin/main (der var den en evig spinner), og `getSession()` leser lokalt lager, så
   sannsynligheten er lav — men konsekvensen ble verre når splashen tok over for
   spinneren. Verdt en liten oppfølger (`.catch(() => setBooting(false))`).
2. **`useTheme`-testdekning:** Design-seksjonen skisserte render-hook-test med **mocket**
   `useColorScheme` for `null/'light'/'dark'`; testen kjører kun default-miljøet (lys) og
   dekker resten via `resolveScheme` + `themeFor`-enhetstester. Komposisjonen er én linje
   og begge halvdeler er låst, og «testfil-detaljer» står eksplisitt under Claude's
   Discretion — derfor ikke fail.
3. `FONTS.serifDisplay` og `FONTS.sansBold` er foreløpig ubrukt i `ui` — men begge lastes
   i `App.tsx`, så det er tokens klare for N4, ikke døde referanser. Som kontrakten ba om.

---

# TOTALVERDIKT: **ACCEPT**

Alle fem kriterier står med evidens jeg produserte selv. Token-splittet er reelt additivt
(20/20 `ui`-nøkler, null fjernede eksporter, `COLORS`/`TAP` uendret), mørke verdier
matcher `app/globals.css` eksakt inkludert `onPrimary`-regelen fra `Button.tsx`, fontene
er beviselig i bundelen og på skjermen, mørk splash er bekreftet i simulator med lest
skjermbilde, og web-fredningen er absolutt (0 linjer utenfor de tre sonene).

**Betingelse før merge (ikke en byggerdefekt):** PR-body må liste de nye
token-eksportene (`Scheme`, `ThemeColors`, `PALETTES`, `FONTS`, `Theme`, `themeFor`,
`resolveScheme`, `useTheme`) for N4-rebasen, og huke av kriterium 5.
