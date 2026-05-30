-- 0059_fourball_description_norwegian.sql
-- #288 (del av format-epic #270) — rydd fourball_matchplay-beskrivelsen til
-- norsk-først stil, på linje med de nyere format-radene (#274–#284).
-- #217 seedet raden med engelsk-preget «2v2 best-ball matchplay»; denne
-- oppdateringen bytter til samme tone som resten av katalogen. Kun
-- admin-synlig (wizard FormatGrid-tooltip), ingen skjema-endring.

update public.formats
set short_description = '2 mot 2, hull for hull. Alle spiller egen ball, lagets beste score teller per hull.'
where slug = 'fourball_matchplay';
