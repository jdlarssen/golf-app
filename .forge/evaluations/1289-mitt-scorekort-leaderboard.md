# Evaluering: «Mitt scorekort» på leaderboardet for ferdige spill (#1289)

**Branch:** `claude/scorecard-access-bug-ff2138`
**Commits vurdert:** `32927467` (fix) + `4d5800da` (docs: kontrakt-evidens)
**Evaluator:** fersk kontekst, uavhengig verifikasjon mot kode og gates

## Verdikt: ACCEPT

Alle syv kriterier stemmer overens med koden slik den faktisk er skrevet, ikke bare med
kontraktens evidens-notater. Ingen lekkasje til spectate/demo/holes-drilldown funnet.
Begge gates kjørt på nytt i denne økten og grønne.

## Per-kriterium

**K1 — CTA lenker til `/games/{id}/scorecard` på ferdig spill.**
Bekreftet. `page.tsx:181-198` monterer `MyScorecardCtaProvider` med
`href={`/games/${id}/scorecard`}` bak `showMyScorecard`-gaten. `MyScorecardCta.tsx` render
er `LinkButton href={href}` → `LinkButton` er en tynn wrapper rundt `SmartLink` (ekte
`<a>`, ikke en JS-only click-handler) — `components/ui/Button.tsx:59-78`. Unit-test
asserterer `href`-attributtet direkte.

**K2 — Ingen lekkasje til aktivt spill / spectate / demo / holes / ikke-deltaker / trukket spiller.**
Bekreftet med selvstendig grep, ikke bare kontraktens påstand:
- `grep -rn "MyScorecardCtaProvider"` viser KUN én mount-site i hele appen:
  `app/[locale]/games/[id]/leaderboard/page.tsx`. Ingen `layout.tsx` finnes i
  `leaderboard/`-mappa, så `holes/page.tsx` (separat route) deler ikke React-treet med
  `page.tsx` uansett — og den bruker ikke `LeaderboardShell` i det hele tatt (egen
  kommentar i filen bekrefter det, linje 80-81).
- `app/[locale]/spectate/[token]/page.tsx` kaller samme `renderLeaderboardContent()`
  som authed-siden, men wrapper den ALDRI i `MyScorecardCtaProvider` → enhver
  `LeaderboardShell` nedover i formatvisningene får `MyScorecardCta` til å rendre `null`
  (provider-absence, samme mekanisme som `RevansjeCta`).
- `app/[locale]/demo/DemoGame.tsx:182` setter `live={false}` på `LeaderboardShell` →
  `floatingCtas` (som inneholder `MyScorecardCta`) settes til `null` uansett provider-
  status (`LeaderboardChrome.tsx:63-72`) — dobbel beskyttelse, ikke bare provider-fravær.
- Aktivt spill / ikke-deltaker / trukket spiller: gaten i `page.tsx:181-183`
  (`game.status === 'finished' && gwp.players.some(p => p.user_id === userId &&
  !p.withdrawn_at)`) dekker alle tre — verifisert at `withdrawn_at` faktisk er en kolonne
  som selecte's i `lib/games/getGameWithPlayers.ts:165,209` (ikke en påstått kolonne som
  ikke finnes).
- Admin-tilskuer uten eget spillerforhold: `gwp.players.some(p => p.user_id === userId
  ...)` er `false` for en admin som ikke er i `game_players`-lista → ingen CTA. Riktig.

**K3 — Cup/liga viser CTA (ingen standalone-gate).**
Bekreftet ved kontrast i samme fil: `showRevansje` (linje 169-173) sjekker eksplisitt
`!game.tournament_id && !game.league_round_id`; `showMyScorecard` (linje 181-183) gjør
det ikke. Ingen skjult filtrering andre steder i denne code path-en.

**K4 — i18n-nøkler i begge språk, riktig namespace.**
Bekreftet med et Node-skript som faktisk parser JSON-strukturen (ikke bare grep-linjenr):
`no.leaderboard.common.myScorecardButton = "Mitt scorekort"`,
`en.leaderboard.common.myScorecardButton = "My scorecard"`. Komponenten bruker
`useTranslations('leaderboard.common')` + `t('myScorecardButton')` — samme namespace som
`RevansjeCta`.

**K5 — Unit-test etter sibling-mønster.**
Bekreftet. `MyScorecardCta.test.tsx` speiler `RevansjeCta.test.tsx` strukturelt: (a)
"rendrer ingenting uten provider" — `toBeEmptyDOMElement()`, (b) med provider —
`getByTestId` + href- og tekst-assertion. Kjørt i denne økten: begge testene i suiten,
del av 191/191 grønne (se gates under).

**K6 — Build + co-located tester grønne.**
Delvis re-verifisert i denne økten (se Gates). `npm run build` ble IKKE kjørt på nytt per
eksplisitt instruks (allerede grønn to ganger); det er en akseptert evidens-gap, ikke et
funn — instruksen for denne evalueringen sa uttrykkelig å ikke kjøre den.

**K7 — Staging-klikkrunde.**
PR #1291 har `staging-verified`-label + en detaljert bevis-kommentar (Playwright-driver,
5 steg, spesifikke game-ID-er `fab70b1a…`/`9df7b9e0…`, negativ-sjekk på aktivt spill,
prod-vakt-bekreftelse på at alle Supabase-kall gikk mot staging-ref
`snwmueecmfqqdurxedxv`). Formen matcher andre aksepterte staging-verifiseringer i dette
repoet. Dekker verifikasjonsplanens steg 1-3 fullt ut. Godtas som levert, per oppgavens
instruks.

## Gates kjørt i denne økten

- `source ~/.nvm/nvm.sh && nvm use 22` → v22.23.0
- `npx vitest run "app/[locale]/games/[id]/leaderboard"` → **41 filer / 191 tester,
  alle grønne** (72.16s)
- `npx tsc --noEmit` → **exit 0**
- `npm run build` → ikke kjørt (eksplisitt instruert å hoppe over; allerede grønn 2×
  ifølge kontrakten)

## Regresjonsvurdering

`LeaderboardChrome.tsx`-endringen (linje 9, 67-68) legger kun til én ekstra
selvgatende komponent i `floatingCtas`-fragmentet, som allerede var betinget på
`live`-flagget. Ingen av de ~25 formatvisning-testene (BingoBangoBongo, SoloStableford,
Wolf, Nassau, osv. — alle i den samme vitest-kjøringen) brøt, fordi `MyScorecardCta`
rendrer `null` uten provider og ingen av dem monterer provideren. Demo-flaten er dekket
av `live={false}`-kortslutningen uavhengig av provider-status. Ingen funn.

## Funn

Ingen. Ingen avvik mellom kontraktens kriterier og faktisk kode funnet under uavhengig
verifikasjon.
