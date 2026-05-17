-- Refactor tee_boxes fra én-rad-pr-(tee × gender) til én-rad-pr-tee med
-- nullable per-gender rating-kolonner. Erstatter game_players.tee_box_id
-- med tee_gender-flag.

-- 1. Add new nullable rating columns to tee_boxes
alter table public.tee_boxes
  add column slope_mens int check (slope_mens between 55 and 155),
  add column course_rating_mens numeric(4,1),
  add column par_total_mens int check (par_total_mens between 60 and 80),
  add column slope_ladies int check (slope_ladies between 55 and 155),
  add column course_rating_ladies numeric(4,1),
  add column par_total_ladies int check (par_total_ladies between 60 and 80),
  add column slope_juniors int check (slope_juniors between 55 and 155),
  add column course_rating_juniors numeric(4,1),
  add column par_total_juniors int check (par_total_juniors between 60 and 80);

-- 2. Migrate existing tee_boxes data into the appropriate gender-set
update public.tee_boxes set
  slope_mens = slope,
  course_rating_mens = course_rating,
  par_total_mens = par_total
where gender = 'mens';

update public.tee_boxes set
  slope_ladies = slope,
  course_rating_ladies = course_rating,
  par_total_ladies = par_total
where gender = 'ladies';

update public.tee_boxes set
  slope_juniors = slope,
  course_rating_juniors = course_rating,
  par_total_juniors = par_total
where gender = 'juniors';

-- 3. Add CHECK: at least one complete rating-set
alter table public.tee_boxes
  add constraint tee_boxes_at_least_one_rating check (
    (slope_mens is not null and course_rating_mens is not null and par_total_mens is not null) or
    (slope_ladies is not null and course_rating_ladies is not null and par_total_ladies is not null) or
    (slope_juniors is not null and course_rating_juniors is not null and par_total_juniors is not null)
  );

-- 4. Add tee_gender to game_players + migrate from tee_box_id
create type player_tee_gender as enum ('mens', 'ladies', 'juniors');

alter table public.game_players
  add column tee_gender player_tee_gender not null default 'mens';

-- For rows with tee_box_id override, derive gender from the referenced tee.
-- Cast via text since old (tee_box_gender) and new (player_tee_gender) are
-- distinct enum types even though their labels are identical.
update public.game_players gp
set tee_gender = tb.gender::text::player_tee_gender
from public.tee_boxes tb
where gp.tee_box_id = tb.id;

-- 5. Drop old columns
alter table public.game_players
  drop column tee_box_id;

alter table public.tee_boxes
  drop column slope,
  drop column course_rating,
  drop column par_total,
  drop column gender;

drop type tee_box_gender;
