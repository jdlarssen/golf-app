# Kontrakt #1403 — SmartLink-JSDoc beskriver prefetch feil under cacheComponents

**Issue:** #1403 · **Branch:** `claude/docs-trio-1566-1626-1403` · **Type:** docs (kun JSDoc)

## Mål

JSDoc-en i `components/ui/SmartLink.tsx` (L10–23) påstår at `router.prefetch` henter
RSC-payload «rendered with the user's session» så «the destination's data is already in
the router cache». Under `cacheComponents` er det feil premiss — og nettopp premisset som
gjorde at prefetch ble vurdert som offline-løsning (#1350-oppfølging). Skriv JSDoc-en om
så den beskriver faktisk semantikk.

## Fakta-anker (node_modules/next/dist/docs/01-app/02-guides/prefetching.md)

- Statisk rute: full route prefetches. Dynamisk rute: prefetches IKKE — kun loading-UI/
  shell (tabellen L26–30: «Server roundtrip on click: Yes, streamed after shell»).
- Under cacheComponents/PPR: shell-en (prerendret del) prefetches; ucachede/sesjons-
  avhengige hull streames først ved navigasjon.

## Suksesskriterier

- [ ] JSDoc-en påstår ikke lenger at prefetch henter sesjons-rendret data.
- [ ] Ny tekst forklarer: (a) hva som faktisk prefetches (prerendret shell + loading-UI),
  (b) at dynamiske hull tar server-roundtrip ved klikk, (c) hva SmartLink dermed reelt
  kjøper (shell-en maler umiddelbart ved tap; touchstart/hover er tidligere enn viewport-
  prefetch for lenker Next ellers ikke rakk/prioriterte).
- [ ] Ingen kodeendring — kun kommentaren (git diff viser bare JSDoc-blokken).

## Gates

- `npm run build` på branchen.
- Prefix `docs:` + `Refs #1403`.

## Antagelser

- ASSUMPTION: touchstart/mouseenter-mekanikken beholdes som i dag — issuet gjelder kun
  den villedende beskrivelsen, ikke om komponenten bør finnes (det løpet er #1402/#1350).

## Utenfor scope

- Endre prefetch-adferd eller fjerne SmartLink.
