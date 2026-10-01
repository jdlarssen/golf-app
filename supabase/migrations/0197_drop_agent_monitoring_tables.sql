-- 0197 (#2225): sletter agent_runs og agent_findings.
--
-- Tabellene kom i 0023 for agent-overvåkningen (timesovervåker, merge-vakt og
-- morgenrapport). Den ble pensjonert i mai 2026: de planlagte oppgavene er
-- skrudd av, og koden (lib/agent-monitor/) og promptene (agents/) er slettet i
-- samme PR. Ingenting i appen leser eller skriver tabellene.
--
-- Merknaden i 0091 («agent-monitoring er aktiv kode», begrunnelsen for å
-- beholde agent_findings_fingerprint_idx og agent_runs_ran_at_idx) er dermed
-- utgått. Migrasjoner er historikk, så den står, og denne fila dokumenterer at
-- den ikke gjelder lenger.
--
-- agent_findings først: den har en FK til agent_runs. Indeksene og
-- RLS-oppsettet forsvinner med tabellene.

drop table if exists public.agent_findings;
drop table if exists public.agent_runs;
