-- 0151_games_hole_segment_and_source_game.sql
--
-- Splittet cup-dag (#1441): én fysisk 18-hulls-runde teller som flere
-- cup-matcher — front 9 greensome, back 9 fourball, pluss singles-matcher
-- som leser fourball-spillets scores i stedet for egen føring.
--
-- To nye kolonner på games:
--
--   hole_segment ('full' | 'front9' | 'back9')
--     Hvilken del av banen matchen spilles over. 'full' = dagens oppførsel
--     og default for alt eksisterende. Matchplay-motorene regner mot antall
--     hull i scope (ikke hardkodet 18) fra og med #1441.
--
--   source_game_id (uuid → games.id)
--     Satt på avledede matcher: matchen har egne game_players (1v1) men
--     INGEN egne scores — alle lese-stier henter scores fra host-spillet,
--     filtrert på segmentets hull og matchens spillere. ON DELETE CASCADE:
--     en avledet match er meningsløs uten kilden sin; cup-genereringens
--     rollback-batch (#675-mønsteret) sletter host først og tar de avledede
--     med seg.
--
-- Skranker:
--   games_hole_segment_valid: verdi-lista.
--   games_hole_segment_matchplay_only: segment ≠ 'full' er kun gyldig for
--     matchplay-duellformatene. Strokeplay-familien (tiebreaker/padTo18),
--     nassau, wolf, round_robin og patsome er strukturelt 18-hulls — en
--     direkte PostgREST-write skal ikke kunne lage et segment-spill i et
--     format som ikke kan regne det (AGENTS.md-felle #3/#4; speiles av
--     isMatchplayFamily i lib/scoring/modes/types.ts — layer-agreement-test
--     i lib/ knytter listene sammen).
--
-- Bevisst UTELATT: DB-guard mot scores utenfor segmentet. Motoren ignorerer
-- hull utenfor scope ved lesing (testet i lib/scoring), så en fiendtlig
-- score-rad på hull 3 i et back9-spill er støy, ikke korrupsjon. Avledede
-- spill får aldri egne scores av appen; lese-stiene går via source_game_id.

alter table public.games
  add column hole_segment text not null default 'full',
  add column source_game_id uuid null references public.games(id) on delete cascade;

alter table public.games
  add constraint games_hole_segment_valid check (
    hole_segment in ('full', 'front9', 'back9')
  );

alter table public.games
  add constraint games_hole_segment_matchplay_only check (
    hole_segment = 'full'
    or game_mode in (
      'singles_matchplay',
      'fourball_matchplay',
      'foursomes_matchplay',
      'greensome_matchplay',
      'chapman_matchplay',
      'gruesome_matchplay'
    )
  );

create index games_source_game_id_idx
  on public.games (source_game_id)
  where source_game_id is not null;
