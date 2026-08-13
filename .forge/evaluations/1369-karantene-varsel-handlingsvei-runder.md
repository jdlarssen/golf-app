# Evaluerings-runder — 1369-karantene-varsel-handlingsvei

Runde 1: ACCEPT — signaturer (ikke-blokkerende): `SyncBanner.test.tsx + kriterium 4` (7 it-blokker vs «én render-test»-ordlyd; presedens = én testfil per komponent), `SyncBanner.tsx + kriterium 2` (teoretisk ms-vindu mellom Dexie-write og liveQuery-re-render før dismiss; designet render-snapshot).
