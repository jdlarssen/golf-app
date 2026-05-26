-- Per-kjønn-overstyring av hull-par (#240).
--
-- Speiler tee_boxes-mønsteret med _mens/_ladies/_juniors-suffiks. Frem til
-- denne migrasjonen har course_holes hatt én felles `par`-verdi per hull —
-- antagelsen holder for ~99 % av norske baner, men brytes på baner med
-- dame-tee plassert kortere før et vannhinder slik at hullet får ulik
-- par-karakter mellom kjønn (typisk dame-par-5 / herre-par-4).
--
-- Forced cutover: ingen midlertidig dual-write-fase. Backfill setter alle
-- tre nye kolonner til samme verdi som gammel `par`, deretter dropper vi
-- gamle `par`-kolonnen. Alle scoring-modi og mapper-call-sites oppdateres
-- i samme PR til å lese par_mens/par_ladies/par_juniors via tee_gender-
-- oppslag på spillerens game_players-rad.

alter table public.course_holes
  add column par_mens int check (par_mens between 3 and 6),
  add column par_ladies int check (par_ladies between 3 and 6),
  add column par_juniors int check (par_juniors between 3 and 6);

update public.course_holes
   set par_mens    = par,
       par_ladies  = par,
       par_juniors = par
 where par_mens is null;

alter table public.course_holes
  alter column par_mens    set not null,
  alter column par_ladies  set not null,
  alter column par_juniors set not null;

alter table public.course_holes drop column par;

comment on column public.course_holes.par_mens is
  'Par for hullet sett fra herre-tee. NOT NULL. #240.';
comment on column public.course_holes.par_ladies is
  'Par for hullet sett fra dame-tee. NOT NULL — sett lik par_mens for hull der dame-par er identisk. #240.';
comment on column public.course_holes.par_juniors is
  'Par for hullet sett fra junior-tee. NOT NULL — sett lik par_mens som default. #240.';
