-- #2277: a tee's colour, picked when the course is entered (#2486 builds the picker).
alter table public.tee_boxes
  add column color text
    constraint tee_boxes_color_check
    check (color is null or color in ('white', 'yellow', 'red', 'blue', 'orange'));
comment on column public.tee_boxes.color is
  'Tee colour key (#2277). null = no colour (a numbered or named tee). Palette: lib/courses/teeColors.ts.';
