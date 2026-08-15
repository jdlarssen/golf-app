# Runde-historikk — 1383-veiviser-foreldet-steglenke

Konvergensregler #1077: én linje per evaluate-runde, med verdikt og finding-signaturer
(`fil + kriterium`, ikke fritekst). Fremgang måles ved å sammenligne signatur-settet mot
forrige runde.

| Runde | Verdikt | Finding-signaturer | Kommentar |
|---|---|---|---|
| 1 | NEEDS WORK | `GameWizard.tsx + dep-array kjører reset per navigasjon (F1/F2/F3)`, `GameWizard.tsx + isSeededFlow teller nøkler ikke verdier (F5)`, `GameWizardStepHistory.test.tsx + statisk searchString ser ikke navigasjons-stien (F6)`, `GameWizard.tsx + ett-felts seed slår av reset (F4)` | F1 verifisert live på staging av evaluatoren: cup + «Neste» bounces til steg 1 på begge dører. Kriterium 1–5 alle PASS, men porten «staging-klikkrunde» underkjent som utilstrekkelig — AP1–AP3 dekket kun mount-tilfeller. |
| 2 | ACCEPT | — (tomt signatur-sett) | F1/F2/F3/F5/F6 rettet i `a1265506`, F4 utsatt til #1653. Evaluatoren beviste fiksen i BEGGE retninger: reverterte dep-arrayet selv, så bouncen komme tilbake live, og bekreftet at regresjonslåsen feiler uten fiksen — altså ikke en vakuøs test. Tre INFO-merknader, ingen blokkerende (se N1–N3 under). |

Ingen no-progress-runder. Taket (5 runder) ikke i nærheten — konvergerte på runde 2.

## INFO-merknader fra runde 2 (ikke blokkerende, ingen handling nå)

- **N1 — det foreldede steget er synlig ~1,5–1,75 s på dev-serveren før reset-en lander.**
  Iboende i en avgjørelse som avhenger av sessionStorage: den kan ikke tas som en
  server-redirect. Kontrakten aksepterte dette vinduet eksplisitt («Synlig steg-N-vindu før
  reset»), og dev-serveren blåser det opp i forhold til prod.
- **N2 — teoretisk mid-flyt-reset hvis `draftContext` endrer seg mens komponenten står
  montert.** Ingen trigger finnes i appen i dag (ingen klient-kode skriver `?intent=`/
  `?klubb=`), så det er en hypotetisk sti, ikke en bug.
- **N3 — regresjonslåsen bruker kompis-flisen, ikke cup.** Den dekker rot-årsaken
  (navigasjon skal ikke re-avgjøre reset-en), men cup-flytens spesielle egenskap — at den
  ALDRI skriver utkast — er kun dekket av staging-kjøringen (AP4/AP5). Bevisst grense:
  en cup-spesifikk enhetstest måtte rendret CupSetup, som er en annen komponent enn den
  denne fila tester.
