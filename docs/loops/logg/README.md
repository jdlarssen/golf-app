# docs/loops/logg — månedsarkiv for de levende tavlene

De levende driftsissuene (#1110 Loop-drift, #1208 Utroperen) arkiveres månedlig
hit og nullstilles, per konvensjonen i issue-bodyene. Én fil per tavle per måned:
`YYYY-MM-<tavle>-<issuenr>.md`. Kommentarene kopieres verbatim (forfatter +
tidsstempel), og slettes fra tavla FØRST ETTER at arkiv-PR-en er merget — kopien
skal ligge på `main` før noe forsvinner (eierbeslutning 2026-09-06). Issue-body-en
røres aldri.

Jobben gjøres av `.github/workflows/tavle-arkiv.yml` (#1996), med cron 1.–3. i
måneden. Den 1. skrives filene og arkiv-PR-en åpnes (kortet merger den). Neste
kjøring sletter kommentarene som er byte-identiske med fila på `main`. En
kommentar som avviker blir stående, kjøringen blir rød, og failure-steget filer
varsel-issue. E-postmønstre som ikke står i `.githooks/email-allowlist.txt`
maskeres med «[at]» (#1929), og avviket står i filas header.

Etterslep, eller se hva som vil skje: Actions → Tavle-arkiv → «Run workflow»,
med måned (YYYY-MM) og `dry_run` på (standard). Lokalt:
`GITHUB_TOKEN="$(gh auth token)" npx --yes tsx scripts/loops/archive-boards.ts --dry-run --month YYYY-MM`.
