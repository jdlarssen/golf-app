# docs/loops/logg — månedsarkiv for de levende tavlene

De levende driftsissuene (#1110 Loop-drift, #1208 Utroperen) arkiveres månedlig
hit og nullstilles, per konvensjonen i issue-bodyene. Én fil per tavle per måned:
`YYYY-MM-<tavle>-<issuenr>.md`. Kommentarene kopieres verbatim (forfatter +
tidsstempel), og slettes fra tavla FØRST ETTER at arkiv-PR-en er merget — kopien
skal ligge på `main` før noe forsvinner (eierbeslutning 2026-09-06). Issue-body-en
røres aldri. Kjøres for hånd av en økt inntil #1996 (månedlig GitHub Action).
