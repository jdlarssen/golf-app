-- 0167_claim_push_device.sql
--
-- #1790: en enhet som bytter konto kan ikke re-registrere push. Både
-- `apns_tokens.token` (0166) og `push_subscriptions.endpoint` (0116) er globalt
-- unike, og own-rows-UPDATE-policyen evaluerer USING mot den EKSISTERENDE raden
-- — så når enheten står registrert på konto A, feiler konto B sin upsert med
-- 42501. iOS-skallet re-registrerer ved hver appstart (PwaBoot → initNativePush)
-- og treffer feilen høyt og gjentatt; på web viser bryteren «på» for konto B
-- mens varslene går til konto A sin rad.
--
-- Ren service-role-takeover i actions-laget er bevisst IKKE løsningen: da kunne
-- en innlogget angriper binde et VILKÅRLIG fremmed token/endpoint til egen konto
-- (varsler levert på offerets enhet, token-kartlegging). I stedet: possession-
-- gated takeover. APNs-tokens og web-push-endpoints er uguessbare capability-
-- verdier bare enheten selv kjenner — å PRESENTERE den eksakte verdien er
-- enhetsbeviset. RPC-ene under klaimer raden som matcher verdien, og binder den
-- alltid til auth.uid() — aldri en klientlevert user_id. Klienten kaller dem kun
-- i 42501-fallback; den vanlige upserten (og dens RLS) er fortsatt hovedstien.
--
-- Kjent trade-off (kontrakten #1790, eieren kan velge om): et LEKKET token kan
-- kapres av en innlogget bruker — skaden er begrenset til at offerets enhet
-- mottar angriperens varsler til offeret re-registrerer.
--
-- GUARDRAIL: verken 0116 eller 0166 setter FORCE ROW LEVEL SECURITY, og det er
-- PREMISSET for at SECURITY DEFINER-funksjonene her bypasser RLS (definer-eieren
-- er tabelleier). En senere hardening-runde som legger FORCE på disse tabellene
-- brekker begge RPC-ene stille — ikke gjør det uten å gi funksjonene en annen vei.

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_apns_token — iOS-skallet (#1282-tabellen)
-- ─────────────────────────────────────────────────────────────────────────────
-- Herding per repo-mønsteret (0142/0147/0159/0161): SECURITY DEFINER + tom
-- search_path + skjema-kvalifiserte referanser. `environment` settes IKKE på
-- den nye raden — senderen self-healer og persisterer riktig APNs-miljø ved
-- første push (0166-designet), så et kontobytte nullstiller bare lærdommen.
create or replace function public.claim_apns_token(p_token text, p_user_agent text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_apns_token: not authenticated' using errcode = '42501';
  end if;
  if p_token is null or p_token = '' then
    raise exception 'claim_apns_token: empty token';
  end if;

  -- Possession-klaim: rør KUN raden som matcher den presenterte verdien.
  delete from public.apns_tokens where token = p_token;
  insert into public.apns_tokens (user_id, token, user_agent)
    values (v_uid, p_token, left(p_user_agent, 400));
end;
$$;

comment on function public.claim_apns_token(text, text) is
  '#1790 (0167): possession-gated takeover of an APNs token row when a device '
  'switches accounts. Deletes whichever row holds the exact presented token and '
  'inserts it for auth.uid() — never a client-supplied user_id. Called by '
  'registerApnsToken only as a fallback after the ordinary upsert was refused '
  'by RLS (42501); knowing the unguessable token IS the device-possession proof.';

revoke execute on function public.claim_apns_token(text, text) from public, anon;
grant execute on function public.claim_apns_token(text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- claim_push_subscription — web push (#24-tabellen)
-- ─────────────────────────────────────────────────────────────────────────────
-- p256dh/auth er NOT NULL og hører til abonnementet klienten faktisk besitter,
-- så de følger med inn i den nye raden (samme verdier som den vanlige upserten
-- ville skrevet).
create or replace function public.claim_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'claim_push_subscription: not authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint = '' then
    raise exception 'claim_push_subscription: empty endpoint';
  end if;
  if p_p256dh is null or p_p256dh = '' or p_auth is null or p_auth = '' then
    raise exception 'claim_push_subscription: missing subscription keys';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
    values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400));
end;
$$;

comment on function public.claim_push_subscription(text, text, text, text) is
  '#1790 (0167): possession-gated takeover of a web-push subscription row when '
  'a device switches accounts. Deletes whichever row holds the exact presented '
  'endpoint and inserts it for auth.uid() — never a client-supplied user_id. '
  'Called by savePushSubscription only as a fallback after the ordinary upsert '
  'was refused by RLS (42501); the endpoint is the device-possession proof.';

revoke execute on function public.claim_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.claim_push_subscription(text, text, text, text) to authenticated, service_role;
