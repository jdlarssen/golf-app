-- 0225: colour for the tees whose name is a colour (#2486)
--
-- Before #2486 nobody could set tee_boxes.color, so every tee has null. The
-- owner chose (29.10) to give existing tees a colour once, from the name, but
-- only when the name is exactly Hvit, Gul, Rød, Blå or Oransje (any case, outer
-- spaces ignored). «Men's I», «57» and every other name keep null. Only rows
-- that still have no colour are touched, so the update is safe to run again.

update public.tee_boxes
  set color = case lower(trim(name))
    when 'hvit' then 'white'
    when 'gul' then 'yellow'
    when 'rød' then 'red'
    when 'blå' then 'blue'
    when 'oransje' then 'orange'
  end
  where color is null
    and lower(trim(name)) in ('hvit', 'gul', 'rød', 'blå', 'oransje');
