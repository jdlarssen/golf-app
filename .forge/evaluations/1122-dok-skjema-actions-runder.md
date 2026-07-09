# Konvergens-runder — #1122 (dok-skjema til Actions)

Nattkjøreren 2026-07-09. Bygg på Opus, kryss-modell-gate på Sonnet (Steg 4.5).

| Runde | Type | Verdikt | Funn (signatur) | Handling |
|---|---|---|---|---|
| 1 | Kryss-modell-gate (Sonnet) | REJECT | awk-seksjons-erstatning no-op'er stille hvis markørene i `schema-ground-truth.md` mangler/omdøpes/dupliseres → steg 5 rapporterer «allerede fersk» = falsk grønn (bryter fail-closed). Sekundært: `mv "$DOC.tmp"` uverifisert; ingen post-sjekk på 1/1 markør. | La inn marker-integritetssjekk FØR awk (nøyaktig 1 START + 1 SLUTT, ellers fail_closed), post-sjekk på 1/1 etter erstatning, og `\|\| fail_closed` på `mv`. Verifisert: good→proceed, omdøpt/duplisert markør→fail-closed. |
| 2 | Kryss-modell-gate (Sonnet) | (pågår) | — | — |

## Detaljer runde 1

Sonnet reproduserte defekten off-repo: `sed` omdøpte markørene → awk kopierte fila
byte-identisk uten feil → `git diff --name-only` tom → grønn exit «allerede fersk».
Dette er nettopp «exits 0 while validation actually failed»-mønsteret kontrakten
forbyr. Bekreftet korrekt av gaten: kanonisk SQL byte-identisk med doc, markør-
konstantene i render.py matcher doc, `bash -n`/`py_compile`/YAML rene, permissions
matcher kontrakt, aldri push til main, dedupede issues, assertions til stede.

Fiks (samme commit-serie, Refs #1122): `.github/scripts/dok-skjema.sh` steg 4.
