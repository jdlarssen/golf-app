# Konvergens-runder: #1135 — slå sammen invite-kort + skjul tomme liga/cup-seksjoner

Slug: `1135-klubbside-invite-kort-og-tomme-seksjoner`
Bygger: Opus 4.8 (nattkjøreren) · Branch: `claude/natt-1135-klubb-invite-kort`

| Runde | Verdikt | Finding-signaturer | Notat |
|---|---|---|---|
| 1 | ACCEPT | (ingen) | Bygg mot kontrakt. Del 1: ett invite-kort (e-post + lenke, delt av border-t), ny `inviteHeading` i no+en (paritet). Del 2: tidlig-retur `null` i begge seksjonene når tom og `!canCreate`. Gates grønne: tsc, eslint (0 errors), vitest (2 seksjonstester + catalogParity, 10), `npm run build`. |

Konvergens-signal: gates grønne på første runde, ingen no-progress-loop.

## Kryss-modell-gate (Steg 4.5)

(noteres etter Sonnet-kjøring)
