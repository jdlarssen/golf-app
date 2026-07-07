# Spec: Premieutdeling mangler på solo-stableford + sideturnering ved rundeslutt

**Issue:** #1126 · **Branch:** claude/1126-premieutdeling-solo-stableford-sideturnering

## Problem

I #1051 ble Premieutdeling-kortet (`prizeAwardsNode`) tredd inn i finished-footeren på stableford-podiene. Solo-stableford-grenen (3+ spillere, ikke par-variant) **med sideturnering på** mangler noden på sin return-sti.

Verifisert i `app/[locale]/games/[id]/leaderboard/formats/stableford.tsx`: solo-grenens side-tournament-return (linje 342–357) er `<>{tabs}{reportSection}{wdSection}</>` — uten `{prizeAwardsNode}`. Nabo-grenene gjør det riktig: par-stableford (team-variant) side-return på linje 232–248 har `{prizeAwardsNode}` rett etter `renderSideTournamentTabs`, og soloStrokeplay-renderen (`app/[locale]/games/[id]/leaderboard/formats/soloStrokeplay.tsx` linje 251–263) har samme korrekte mønster. Solo-grenens *ikke*-sideturnering-vei (linje 332–340) har også noden korrekt i `footerSlot`.

Merk: den samme return-en (linje 342–357) dekker BÅDE 2-spiller-duellen (`HeadToHeadResult`, linje 299–317) OG 3+-podiet (`SoloStablefordPodium`, linje 319–330) via `mainContent`-callbacken — så én linje fikser begge grener issuet ber om å sjekke.

Resultat i dag: et avsluttet solo-stableford-spill med sideturnering aktiv og premie lagt inn viser IKKE Premieutdelingen under podiet/fanene.

## Design

1. I `app/[locale]/games/[id]/leaderboard/formats/stableford.tsx`, i return-en på linje 342–357 (solo/duell + sideturnering), sett inn `{prizeAwardsNode}` rett etter `renderSideTournamentTabs({...})`-blokken og før `{reportSection}` — speiler team-variant-grenen på linje 244 og soloStrokeplay linje 261. Resultat-fragmentet blir `<>{tabs}{prizeAwardsNode}{reportSection}{wdSection}</>`.
2. Ingen andre call-sites: `prizeAwardsNode` er allerede en prop på `renderStableford` (linje 62), destrukturert (linje 66), og matet inn fra kalleren uendret. Fiksen er ren node-tre-ing inne i denne fila.
3. Bruker-synlig fix → version-bump `npm version patch --no-git-tag-version` + én Feilrettinger-linje i `CHANGELOG.md` (per `docs/changelog-conventions.md`). Commit med `Refs #1126` i body.
4. PR mot `main` med `Closes #1126` i PR-body. Staging-verify av den berørte flyten før merge (se Gates).

## Success Criteria

- [ ] Solo-stableford (≥3 spillere), sideturnering på, premie lagt inn, avsluttet spill → Premieutdeling-kortet vises under podiet/fanene på leaderboard/spectate.
- [ ] 2-spiller stableford-duell med sideturnering på + premie → Premieutdeling vises (samme return-sti, samtidig fikset).
- [ ] Uendret oppførsel der det alt virket: solo uten sideturnering, par-stableford (begge grener), og live/scheduled-visningene.
- [ ] Fragment-rekkefølgen speiler nabo-grenene: `{tabs}{prizeAwardsNode}{reportSection}{wdSection}`.

## Gates

- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx vitest run lib/games/prizeAwards.test.ts` (eksisterende `linkPrizesToWinners`-dekning — ingen ny unit-test; ren node-tre-ing, samme klasse som #1119)
- [ ] Staging-verify: klikkrunde på torny-staging av nøyaktig konfigurasjonen (solo-stableford, ≥3 spillere, sideturnering + premie, avsluttet) — bevis på PR-en.

## Files Likely Touched

- `app/[locale]/games/[id]/leaderboard/formats/stableford.tsx` — legg `{prizeAwardsNode}` inn i solo/duell-side-tournament-return (linje 342–357).
- `package.json` — patch-bump.
- `CHANGELOG.md` — én Feilrettinger-linje.

## Out of Scope

- Ingen ny unit-test (issuet + #1119-presedens: ren node-tre-ing, `linkPrizesToWinners` alt dekket).
- Andre format-renderere — de øvrige podiene ble dekket i #1119; kun stableford-solo-grenen gjensto.
- Ingen endring i `prizeAwardsNode`-innhold, kaller-siden, eller sideturnerings-logikken.
