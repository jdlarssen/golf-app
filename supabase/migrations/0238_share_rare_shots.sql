-- 0238 (#2894 PR 1): «Del sjeldne slag med alle» — personvernbryteren.
--
-- Står den av, står spilleren ikke i kortet «Sjeldne slag» på Toppliste
-- (`/api/aeresbrett`), og senere ikke på æreslista eller i varselet til alle
-- (#2894 PR 2 og 3). Vennene og ligaen får `friend_achievement` som før.
--
-- Hvorfor her og ikke på users: tabellen er allerede én rad per spiller, bare
-- eieren leser og skriver raden (RLS fra 0236), og ingen rad betyr standard.
-- En ny kolonne på users ville trengt sin egen `grant select` (0186), og
-- medspillere kan lese users-raden. Serveren leser valget med service-rollen
-- (`lib/stats/rareShotOptOuts.ts`).
--
-- Standard er på (true): ingen rad og en rad uten valget betyr «del».
-- Policyene fra 0236 dekker kolonnen; ingen ny policy, ingen ny grant.
-- anonymize_user sletter alt raden allerede (0236), så den er uendret.
--
-- Rekkefølge mot prod: additiv og trygg å påføre før koden. Gammel kode leser
-- ikke kolonnen, og upserten fra appen (`savePushPreferences`) sender bare
-- kolonnene den eier, så den lar valget stå.

alter table public.notification_preferences
  add column share_rare_shots boolean not null default true;

comment on column public.notification_preferences.share_rare_shots is
  'Del sjeldne slag med alle (#2894): false tar spilleren ut av kortet «Sjeldne slag», '
  'æreslista og varselet til alle. Vennene og ligaen får friend_achievement uansett. '
  'Ingen rad betyr true.';

comment on table public.notification_preferences is
  'Varselvalgene (#2315): gruppene som ikke skal plinge (muted_groups) og stille '
  'tid om natta (quiet_hours, 22–07 norsk tid), og om sjeldne slag deles med alle '
  '(share_rare_shots, #2894). Ingen rad betyr alt på. Bare eieren leser og skriver '
  'raden; serveren leser med service-rollen. Push stoppes, innboksen og e-posten '
  'er uendret.';
