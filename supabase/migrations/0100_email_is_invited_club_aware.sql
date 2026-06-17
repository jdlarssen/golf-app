-- 0100_email_is_invited_club_aware.sql
--
-- #659: email_is_invited() gjenkjente bare public.invitations (spill-invitasjoner)
-- og ikke club_invitations. Feature #644 (migrasjon 0099) lar en klubb-admin
-- invitere en UREGISTRERT e-post til klubben via club_invitations, og verifyCode
-- gjør invitéen til medlem via accept_club_invitations(). Men login-steg 1
-- (sendCode → email_is_invited → shouldCreateUser) slapp aldri en klubb-only-
-- invité gjennom: med self-reg-flagget av returnerte Supabase OTP «user not
-- found», så invitéen nådde aldri verifyCode. Klubb-invitasjon til uregistrerte
-- var dermed død uten at NEXT_PUBLIC_ALLOW_SELF_REGISTRATION var på.
--
-- Fix: utvid email_is_invited til å returnere true også ved en åpen, ikke-utløpt
-- club_invitations-rad. Spill-invitasjons-grenen er uendret. Klubb-gyldighet
-- (groups.valid_until) håndteres ved accept-tid i accept_club_invitations() —
-- her speiler vi invitasjonens egen TTL, symmetrisk med invitations-grenen.

create or replace function public.email_is_invited(check_email text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select
    exists (
      select 1
      from public.invitations
      where lower(email) = lower(check_email)
        and accepted_at is null
        and (expires_at is null or expires_at > now())
    )
    or exists (
      select 1
      from public.club_invitations
      where lower(email) = lower(check_email)
        and accepted_at is null
        and expires_at > now()
    );
$function$;
