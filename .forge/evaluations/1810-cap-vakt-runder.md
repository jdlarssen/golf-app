# Forge-runder — #1810 cap-vakter feiler lukket (natt 2026-09-01)

Bygger: Opus-subagent (nattkjøreren, Fable-orkestrert). Evaluator: Opus i fersk kontekst.

| Runde | Utfall | Funn | Aksjon |
|---|---|---|---|
| 1 | ACCEPT | Ingen substansielle defekter. Diff-scope eksakt (5 filer), suksess-sti byte-identisk med main, revert-test beviste at de 3 nye testene faktisk avhenger av fiksen. Nits: (a) TREDJE fail-open-søsken funnet i `lib/cup/getCupJoinContext.ts:73-76` — selvpåmeldingsdøra, bevisst utenfor scope (I4), files som eget issue før merge; (b) kompleksitets-advarsel 46→48 på `createCupMatchesFromPlan` (pre-eksisterende overtramp); (c) smal mock-gren-utforming i generer-testriggen. | (a) filet som eget issue, (b)/(c) står. |
| Kryss-modell (Sonnet) | CONFIRM | Uavhengig revert-test (kun source tilbakestilt, tester beholdt → nøyaktig de 3 nye røde), alle 5 kriterier verifisert, `.changes`-notat rent. | Levering. |
