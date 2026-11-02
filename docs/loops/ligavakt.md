# Ligavakta — kort som venter på markøren og helsa til rundevarslene (#2714)

En daglig lesing i prod mens «Vinterliga 2026-2027» spiller runde 1. Den svarer
på to spørsmål, og den gjør det bare med lesing:

1. Har noe kort ventet på markøren i mer enn to døgn?
2. Går rundevarslene? Det vil si at sveipet `league-round-reminder-sweep` lever,
   og at åpningsvarselet og påminnelsen før stengning er sendt.

Vakta er ikke produktkode og er ikke den samme som prod-vakta
(`docs/loops/prod-vakta.md`). Prod-vakta leser advisors og postgres-logg i
Actions og lager issues. Ligavakta er én SQL-spørring som orkestratoren kjører
selv, mot én bestemt liga. De to deler ingen kode og ingen issues.

## Rammer

- **Bare lesing.** Spørringen er én `select`. Orkestratoren skriver aldri i
  prod via vakta, og vakta godkjenner ingenting for eieren. Eieren godkjenner
  selv fra køen «Venter på markøren».
- **Ingen personopplysninger.** Spørringen returnerer bare tellinger og noen få
  tilstandsfelt. Ingen navn, e-post eller bruker-ID kommer ut, og derfor kan
  ingenting slikt havne i et issue eller en logg.
- **Starter ingen arbeidere.** Vakta er én spørring, så den fortsetter også
  når ukeforbruket er på 80–90 %.

## Start og stopp

- **Første kjøring:** søndag 8.11.2026, kl. 07:15 Oslo-tid, dagen før runde 1
  åpner.
- **Siste kjøring:** morgenen 23.11.2026, etter at stoppsjekken under viser at
  åpningsvarselet på runde 2 er sendt. Runde 2 åpner 23.11 kl. 00:00 Oslo-tid
  ifølge live DB. `docs/roadmap.md` sier 22.11, men live DB gjelder.
- Vakta gjelder bare runde 1 og 2. Runde 3 og utover trenger en ny vurdering.
- Den planlagte jobben på Macen peker hit og ingen andre steder, så denne fila
  er fasiten for spørringen og reglene. Jobben sjekker først om #2714 alt har en
  kommentar med dagens dato. Finnes den, skjer ingenting.

Stoppsjekk (lesing, to rader, bare sannhetsverdier):

```sql
select r.sequence, (r.opening_notice_sent_at is not null) as apnet_varslet, (r.opens_at < now()) as apnet
from public.league_rounds r
where r.league_id = 'a10beeb3-7d6c-458e-8d45-e27d9f114e59' and r.sequence in (1, 2)
order by r.sequence;
```

Vakta er ferdig når rad 2 har `apnet_varslet = true`. Er rad 2 åpnet
(`apnet = true`) men ikke varslet, kjører hovedspørringen videre, og
`apning_forsinket` slår ut etter to timer. Vakta stopper først når varselet er
sendt, eller når eieren sier stopp.

## Spørringen

Kjøres via Supabase MCP mot prod (`glofubopddkjhymcbaph`). På staging bytter du
bare liga-ID-en (simulatorligaen er `2fe73ecb-e26c-40f9-b170-fdeb9fb2c37a`).

```sql
with liga as (select id, status, created_by from public.leagues where id = 'a10beeb3-7d6c-458e-8d45-e27d9f114e59'),
runder as (select r.* from public.league_rounds r join liga on liga.id = r.league_id),
kort as (
  select gp.submitted_at, gp.user_id, gp.marker_user_id, gp.submitted_by_user_id, liga.created_by as arr
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  join runder r on r.id = g.league_round_id
  cross join liga
  where g.status = 'active' and gp.withdrawn_at is null and gp.submitted_at is not null
    and gp.approved_at is null and gp.marker_user_id is not null
),
gamle as (select * from kort where submitted_at < now() - interval '48 hours'),
jobb as (
  select j.active,
    (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as siste,
    (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status <> 'succeeded'
       and d.start_time > now() - interval '24 hours') as feil
  from cron.job j where j.jobname = 'league-round-reminder-sweep'
)
select
  (select status from liga) as liga_status,
  (select count(*) from runder where opens_at < now() + interval '24 hours' and closes_at > now() and tee_box_id is null) as runde_uten_tee,
  (select count(*) from kort) as venter_totalt,
  (select count(*) from gamle) as over_48t,
  (select count(*) from gamle where marker_user_id <> arr and user_id <> arr and submitted_by_user_id is distinct from arr) as i_arrangorkoen,
  (select count(*) from gamle where marker_user_id = arr) as du_er_markor,
  (select count(*) from gamle where user_id = arr or submitted_by_user_id = arr) as ditt_eget,
  (select active from jobb) as sveip_aktiv,
  (select now() - siste < interval '2 hours' from jobb) as sveip_ferskt,
  (select feil from jobb) as sveip_feil_24t,
  (select count(*) from runder where opens_at < now() - interval '2 hours' and closes_at > now() and opening_notice_sent_at is null) as apning_forsinket,
  (select count(*) from runder where closes_at > now() and closes_at < now() + interval '46 hours' and closing_reminder_sent_at is null) as paminnelse_forsinket,
  (select count(*) from runder r where r.opening_notice_sent_at is not null and not exists (
     select 1 from public.notifications n where n.kind = 'league_round_open' and n.payload ->> 'round_id' = r.id::text)) as apning_uten_varsler;
```

### Hva feltene betyr

- `kort` er kortene som er levert, ikke trukket, ikke godkjent, har en markør og
  ligger i et aktivt spill i ligaen. Et avvist kort har `submitted_at` tomt
  (`lib/games/reviewScorecardCore.ts`) og venter på spilleren, så det er ikke
  med. Klokka starter på nytt når kortet leveres igjen.
- `venter_totalt` er alle slike kort, uansett alder. `over_48t` er de som ble
  levert for mer enn 48 timer siden.
- `i_arrangorkoen`, `du_er_markor` og `ditt_eget` deler de gamle kortene slik
  køene på ligasiden deler dem. Eieren er både arrangør og spiller, så
  beskjeden må skille tilfellene.
- `sveip_*` leser `cron.job` og `cron.job_run_details`. Tabellen med kjøringer
  går bare 7 dager tilbake (`lib/cron/AGENTS.md`).
- `apning_uten_varsler` fanger at stempelet er satt uten at noen varsler ligger
  i innboksen. Stempelet settes før varslene sendes, og sendingen er best-effort
  (`lib/notifications/leagueRoundNotices.ts`).

## Når eieren får beskjed

`null` regnes som alarm, aldri som «alt i orden». En tom `liga_status` betyr at
ligaen ikke ble funnet.

| Felt | Regel | Beskjed til eieren |
|---|---|---|
| `i_arrangorkoen` > 0 | Kort over to døgn i arrangørkøen | «N kort har ventet på markøren i over to døgn. Du kan godkjenne dem under «Venter på markøren»: \<lenke til ligasiden\>» |
| `du_er_markor` > 0 | Eieren er markøren | «N kort venter på deg som markør: \<lenke til ligasiden\>» |
| `ditt_eget` > 0 | Kort eieren eier eller har levert | «Et kort du eier eller har levert, har ventet i over to døgn. Du kan ikke godkjenne det selv, så si fra til markøren.» |
| `liga_status` er ikke `active`, fra 8.11 til runde 2 er åpnet | Ligaen er ikke startet | «Ligaen er ikke startet, så åpningsvarselet går ikke. Trykk «Start ligaen» på admin-siden.» |
| `runde_uten_tee` > 0 | Runden mangler tee | «Runden mangler tee.» |
| `sveip_aktiv` er ikke `true`, `sveip_ferskt` er ikke `true`, `sveip_feil_24t` > 0, `apning_forsinket` > 0, `paminnelse_forsinket` > 0 eller `apning_uten_varsler` > 0 | Rundevarslene svikter | Én setning om hva som mangler. Orkestratoren feilsøker lesende etter `lib/cron/AGENTS.md` før den spør eieren om noe. |

Et kort kan telle i både `du_er_markor` og `ditt_eget` (eieren er markør og har
levert kortet selv). Ingen kan godkjenne et slikt kort, for den som leverte det
får ikke svare som markør (`mayApproveAsMarker` i `lib/league/leagueMarker.ts`).
Send da bare `ditt_eget`-beskjeden, ikke begge.

`sveip_aktiv`, `sveip_ferskt` og `sveip_feil_24t` viser bare at jobbens
SQL-port kjørte (signal 1 i `lib/cron/AGENTS.md`), ikke at ruten svarte. Svikter
ruten (401 eller 500), merkes det først på `apning_forsinket` og
`paminnelse_forsinket`, og bare når et varsel skulle gått.

Alt stille: ingen beskjed til eieren. Slår en regel ut, får eieren én samlet
linje hver morgen så lenge noe er galt, i orkestrator-chatten og som varsel på
Macen.

`sveip_aktiv = null` i prod betyr at jobben ikke finnes, og er alarm. Det er
normalt på staging, fordi staging ikke har noen cron-jobber (`lib/cron/AGENTS.md`).

`apning_uten_varsler` kan også slå ut uten feil hvis ingen skulle ha varsel, for
eksempel når alle spillerne alt har et spill i runden når den åpner. Finn ut
hva som skjedde før du varsler eieren.

## Hver dag

1. Sjekk om #2714 alt har en kommentar med dagens dato. Finnes den, er du ferdig.
2. Kjør spørringen over mot prod via Supabase MCP.
3. Post én linje på #2714, for eksempel `Ligavakt 2026-11-09: 0 over to døgn,
   varsler OK`. Bare tellinger. Repoet er offentlig, så kommentaren har ingen
   navn, ingen lenke til enkeltkort og ingen rå utskrift.
4. Slår en regel ut, send beskjeden fra tabellen over.

## Kilder som må holdes i takt

Regelen for hvilke kort som venter, bor flere steder (`AGENTS.md`, felle 4).
Endres en av dem, må spørringen endres i samme PR:

- `lib/league/getLigaSnapshot.ts`, løkka over `awaitingByRound`: predikatet
  `withdrawn_at`, `submitted_at`, `approved_at` og `marker_user_id`.
- `lib/league/markerQueues.ts`: inndelingen i marker-, arrangør- og eget kort.
- `lib/cron/AGENTS.md`: hvordan sveipet og cron-helsa leses.
- `lib/notifications/leagueRoundNotices.ts`: stemplene og varseltypen
  `league_round_open` som `apning_uten_varsler` leter etter.

## Det vakta ikke beviser

VERIFICATION GAP: tellingen viser at varselet ble lagt i innboksen, ikke at noen
leste det eller at e-post og push kom fram.

## Prøvekjøring 2.11.2026

| Felt | Prod (bare lesing) | Staging, simulatorliga |
|---|---|---|
| `liga_status` | `draft` | `active` |
| `runde_uten_tee` | 0 | 0 |
| `venter_totalt` | 0 | 1 |
| `over_48t` | 0 | 1 |
| `i_arrangorkoen` | 0 | 1 |
| `du_er_markor` | 0 | 0 |
| `ditt_eget` | 0 | 0 |
| `sveip_aktiv` | `true` | `null` |
| `sveip_ferskt` | `true` | `null` |
| `sveip_feil_24t` | 0 | `null` |
| `apning_forsinket` | 0 | 0 |
| `paminnelse_forsinket` | 0 | 2 |
| `apning_uten_varsler` | 0 | 2 |

Staging har bare seedede stempler og ingen sveip, så `paminnelse_forsinket` og
`apning_uten_varsler` viser at spørringen slår ut, ikke at noe er galt der.
På staging er `venter_totalt` 1, og ligasiden viser 1 kort under «Venter på
markøren» for den innloggede arrangøren. Tallene stemmer.

Prod står på `draft`: ligaen er ikke startet ennå, så alle tellingene er 0. Det
slår ut som «Ligaen er ikke startet» fra 8.11 hvis eieren ikke har trykket
«Start ligaen» innen da.
