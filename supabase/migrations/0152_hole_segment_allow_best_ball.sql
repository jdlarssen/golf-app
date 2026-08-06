-- 0152_hole_segment_allow_best_ball.sql
--
-- Splittet cup-dag revisjon (#1441, D11): back 9-hosten er et best ball-spill
-- (individuell føring, netto lagtotal på 85 % allowance) som singles-matchene
-- avleder scores fra. Dermed må hole_segment ≠ 'full' også være gyldig for
-- 'best_ball' — 0151-constrainten tillot kun matchplay-duellformatene.
--
-- TS-motparten bytter samtidig fra isMatchplayFamily til supportsHoleSegment
-- (lib/scoring/modes/types.ts); layer-agreement-testen i
-- lib/scoring/modes/holeSegmentDbCheck.test.ts leser denne fila som fasit
-- (AGENTS.md-felle #4). Øvrige strokeplay-formater er fortsatt 18-hulls.

alter table public.games
  drop constraint games_hole_segment_matchplay_only;

alter table public.games
  add constraint games_hole_segment_matchplay_only check (
    hole_segment = 'full'
    or game_mode in (
      'singles_matchplay',
      'fourball_matchplay',
      'foursomes_matchplay',
      'greensome_matchplay',
      'chapman_matchplay',
      'gruesome_matchplay',
      'best_ball'
    )
  );
