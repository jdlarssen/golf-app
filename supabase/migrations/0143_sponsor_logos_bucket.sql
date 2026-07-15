-- 0143_sponsor_logos_bucket.sql
-- #1052 (oppfølging av premiebordet #1039/#1051): sponsorlogo-opplasting.
--
-- Appens FØRSTE Supabase Storage-flate. Arrangøren laster opp en liten
-- sponsorlogo per premie-slott; pathen lagres i games.prizes-jsonb
-- (sponsorLogoPath, validert i lib/games/prizes.ts — valideringens hjem).
--
-- Bucket-design:
--   • public = true — logoene vises på anon-flater (spectate/embed/leaderboard);
--     offentlig lesing går via CDN uten SELECT-policy. Signerte URL-er ville
--     krevd server-side signering per anon-render og drept CDN-cachingen.
--   • file_size_limit 1 MB — server-sannheten for størrelse (trap #4: klientens
--     5 MB-råfilsgrense er kun UX-guard før nedskalering; canvas-nedskalert
--     webp/png på ~400px ligger langt under taket).
--   • allowed_mime_types: kun raster-formater. SVG lagres ALDRI — SVG godtas
--     som input i wizarden, men rasteriseres klient-side før opplasting
--     (XSS-flaten «lagret SVG» eksisterer dermed ikke).
--
-- RLS på storage.objects (2026-eierskap: tabellen eies av
-- supabase_storage_admin, men postgres kan fortsatt opprette policies —
-- empirisk verifisert mot staging 2026-07-15):
--   • INSERT: kun autentisert, kun i egen mappe {auth.uid()}/… — objektnavnet
--     er direct-request-proof (hostile-opplasting testes i e2e mot staging).
--   • DELETE: kun eier (owner_id, IKKE deprecated owner-kolonnen) — dekker
--     «Fjern»/re-opplasting fra klienten. deleteGame-oppryddingen går via
--     service-role og trenger ingen policy.
--   • Ingen UPDATE-policy: opplasting bruker unike uuid-navn, aldri upsert.
--   • Ingen SELECT-policy: public bucket serverer lesing offentlig.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sponsor-logos',
  'sponsor-logos',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "sponsor logos owner folder insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'sponsor-logos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "sponsor logos owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'sponsor-logos'
  and owner_id = (select auth.uid()::text)
);
