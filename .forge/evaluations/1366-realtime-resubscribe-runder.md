# Konvergensrunder — #1366 realtime resubscribe

Natt 2026-08-14, nattkjøreren (#1079). Bygger: Opus-subagent. Evaluator: Opus-subagent (fersk kontekst). Kryss-modell-gate: Sonnet (Steg 4.5).

| Runde | Utfall | Funn |
|---|---|---|
| 1 | REJECT | Evaluator (med kilde-probe mot pinned realtime-js): **B1** — å fjerne `setAuth` gjør at FØRSTE kanal per sidelast joiner uten access_token (join-payload snapshotes synkront før async token-oppslag rekker frem); verifisert remedie: no-arg `await realtime.setAuth()` før subscribe (primer token, `_manuallySetToken` forblir false). **B2** — ny CLAUDE.md/README/bindings-tekst var faktisk feil (TOKEN_REFRESHED-propagering virker uavhengig av manuelt token; heartbeat-upkeep bruker alltid accessToken-callbacken). **M3** — `consecutiveFailures` nullstilles ved schedule, ikke rebuild → gammel kanal forgifter ny kanals budsjett. **M4** — `parkedUntilOnline` ryddes ikke av `SUBSCRIBED` → frisk kanal rebuildes på neste online-event. **M5** — `docs/uat-empty-states-...md` bærer fortsatt gammel regel. Nits: død `setAuthSpy`-mock, ingen pre-warm-assertion. Verifisert rent: signatur/8 call-sites, new-before-old-ordering, CLOSED-håndtering, unmount-lekkasje, backoff-cap, hygiene. |
