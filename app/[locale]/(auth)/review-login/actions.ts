'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { consumeLoginRateLimit } from '@/lib/auth/loginRateLimit';
import { getClientIp } from '@/lib/admin/rateLimit';

/**
 * #1284: én generisk feilkode for ALT som kan gå galt i innloggingen —
 * ukjent adresse, feil adresse og feil passord ser identiske ut utenfra.
 * Uten det ville ruta vært et konto-orakel: en angriper kunne kartlagt
 * hvilken adresse review-kontoen har ved å lese feilmeldingen.
 * `rate_limited` er den ene koden som skiller seg ut, fordi ventetiden er
 * informasjon brukeren trenger (og ikke lekker noe om kontoen).
 */
function reviewErrorRedirect(
  code: 'review_failed' | 'rate_limited',
  email: string,
): never {
  const qs = new URLSearchParams();
  // Behold adressen så feltet står utfylt etter en feil (samme grep som
  // loginErrorRedirect i login/actions.ts, uten next/invite-konteksten).
  if (email) qs.set('email', email);
  qs.set('error', code);
  redirect(`/review-login?${qs.toString()}`);
}

/**
 * Passord-innlogging for App Store-review-kontoen (#1284).
 *
 * Apple sine reviewere kan ikke motta OTP-mailene våre, og App Store Connect
 * forventer et brukernavn/passord-par. Denne action-en er den eneste veien
 * inn med passord i hele appen, og den er snevret inn til én adresse:
 * `REVIEW_ACCOUNT_EMAIL`. Er env-varen usatt, finnes ikke ruta (page.tsx
 * svarer notFound()) og denne action-en avviser alt — de to gatene leser
 * SAMME env-var, og må endres sammen.
 *
 * Ingen invitasjons-/klubb-side-effekter som i verifyCode: review-kontoen har
 * ingen invitasjoner, og en reviewer skal ikke kunne dra med seg noen.
 */
export async function signInWithReviewPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');

  // Rate-limit FØR alt annet, inkludert adresse-sjekken: en angriper som
  // gjetter passord skal brenne buckets uansett hvilken adresse de sender.
  // Samme buckets og terskler som /login (email + IP).
  const ip = await getClientIp();
  const rl = await consumeLoginRateLimit({ email, ip });
  if (!rl.ok) {
    reviewErrorRedirect('rate_limited', email);
  }

  const expected = (process.env.REVIEW_ACCOUNT_EMAIL ?? '')
    .trim()
    .toLowerCase();

  // Usatt env, tomt skjema eller feil adresse → samme kode som feil passord.
  if (!expected || !email || !password || email !== expected) {
    reviewErrorRedirect('review_failed', email);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Statisk logglinje: aldri passordet, aldri Supabase-meldingen (den
    // skiller ikke ukjent konto fra feil passord uansett).
    console.warn('[review-login] password sign-in rejected');
    reviewErrorRedirect('review_failed', email);
  }

  redirect('/');
}
