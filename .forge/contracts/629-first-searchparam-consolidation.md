# Kontrakt: #629 — Konsolider duplisert `first()` searchParam-helper

**Issue:** [#629](https://github.com/jdlarssen/golf-app/issues/629)
**Type:** Rent mekanisk refactor — ingen oppførselsendring, ingen version-bump (`refactor(url): …`)
**Branch:** `claude/sweet-murdock-533526`

## Kontekst

`#611` etablerte den kanoniske `lib/url/searchParams.ts` med `first()` + `resolveErrorCode()`, og koblet `login` + `complete-profile` til den. De resterende sidene/actions har fortsatt sin egen lokale kopi av `first()`.

Issuet estimerte ~26 filer ut fra et eldre #611-grep. **Faktisk telling per d.d. = 45 definisjoner** (nye cup/liga/klubber/formats-sider har kommet til). Kontrakten dekker alle 45 — å la 19 stå halvferdig ville etterlate akkurat den duplikasjonen issuet vil fjerne.

### Verifiserte fakta (grep + Python-sjekk)

- **45 lokale definisjoner**, alle funksjonelt identiske med kanonisk `first`:
  - **Stil A** (19 filer): `return Array.isArray(x) ? x[0] : x;`
  - **Stil B** (26 filer): `if (Array.isArray(value)) return value[0];` + `return value;`
  - Begge er semantisk identiske med kanonisk `return Array.isArray(value) ? value[0] : value;`.
- **2 av 45 heter `firstParam`** (`liga/[id]/page.tsx`, `liga/[id]/meld-av/page.tsx`), med totalt **2 call-sites** (`firstParam(sp.error)` hver).
- **0 av 45** har JSDoc/kommentar direkte over seg → ren fjerning.
- Import-presedens (#611): `import { first } from '@/lib/url/searchParams';`

### Eksplisitt utenfor scope

- `resolveErrorCode` (allerede delt der den brukes; ikke del av #629).
- Lokale `const first = result.players[0]` / `const first = firstName(...)` i podium/view-filer — **lokale variabler, ikke helperen**. Røres ikke.
- Navne-helpers (`firstName`, `firstNameOf`, `firstParam`-of-name, `firstJoined`, `lib/admin/rateLimit.ts` xff-split) — urelaterte, røres ikke.

## Success-kriterier

- [x] **K1:** Alle 45 lokale definisjoner fjernet. Evidens: post-apply grep `function (first|firstParam)\((value|v): string \| string\[\] \| undefined` → **0 treff**.
- [x] **K2:** Hver berørt fil importerer `first`. Evidens: `grep "from '@/lib/url/searchParams'"` → **47 filer** (45 nye + login + complete-profile).
- [x] **K3:** De 2 `firstParam(...)`-call-sitene renamet til `first(...)`. Evidens: grep `firstParam(` → **none**; `liga/[id]/page.tsx:159 const joinError = first(sp.error)`.
- [x] **K4:** Ingen oppførselsendring. Evidens: `tsc --noEmit` 0 feil, `npm run build` grønn, `vitest run` **3481/3481 tester grønne** (274 filer).
- [x] **K5:** `fallow@2.96 dead-code` → **ingen `first`/`firstParam`/searchParams-funn** (klonene borte, kanonisk `first`-eksport konsumert, ikke orphan). De 3 gjenværende duplicate-pairs (`Intent`/`compute`/`computeLeaderboard`) er kjente pre-eksisterende false-positives, urelatert til #629.

## Gates

Kjøres scoped til endringen (mekanisk refactor → statisk verifikasjon er autoritativ):

1. `npx tsc --noEmit` → 0 feil.
2. `npm run build` → grønn (fanger import-/syntaksfeil i alle berørte route-filer).
3. `npx vitest run` → grønn (ingen test skal bryte; ingen test rører helperen, men kjøres for sikkerhet).
4. `npx fallow@2.96 dead-code` → ingen `first`-duplikat-klone igjen, ingen nye orphans.

## Notater

- Ingen version-bump / CHANGELOG (ren `refactor(...)`, passerer commit-msg-hook fritt).
- Transformasjonen gjøres deterministisk via skript (fjern helper-blokk + sett inn import som første import-linje), så LLM-variabilitet ikke introduserer inkonsistens over 45 filer. tsc + build + fallow er fasit.
- Atomisk commit; ingen brukersynlig endring.
