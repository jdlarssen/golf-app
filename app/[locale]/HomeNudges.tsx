import { getServerClient } from '@/lib/supabase/server';
import { getPasskeyEnrollAccess } from '@/lib/auth/passkeyEnrollAccess';
import { readOwnAiConsent } from '@/lib/ai/consent';
import { hasFinishedRoundInKavalkadeYear } from '@/lib/kavalkade/hasKavalkadeRound';
import {
  KAVALKADE_YEAR,
  kavalkadeHomeSlot,
  type KavalkadeHomeSlot,
} from '@/lib/kavalkade/release';
import {
  HomeNudgeRail,
  type ProductUpdateNudge,
} from './HomeNudgeRail';

/**
 * Server-halvdelen av nudge-køen på Hjem (#1797, kontrakt #1069 K6). Avklarer
 * de server-avgjorte plassene parallelt — siste uleste produktnytt (RLS via
 * session-client → brukeren ser kun egne rader), passkey-utrullingsgaten,
 * Kavalkaden (#2131) og spørsmålet om AI-tekster (#2561) — og gir
 * klient-orkestratoren `HomeNudgeRail` et ferdig verdikt for alle.
 * Suspense-wrappes på mount-stedet så oppslagene aldri blokkerer side-skallet.
 */
export async function HomeNudges({ userId }: { userId: string }) {
  const [passkeyEligible, productUpdate, kavalkade, aiConsentUnanswered] =
    await Promise.all([
      getPasskeyEnrollAccess(),
      fetchLatestProductUpdate(userId),
      resolveKavalkadeSlot(userId),
      resolveAiConsentUnanswered(),
    ]);

  return (
    <HomeNudgeRail
      productUpdate={productUpdate}
      passkeyEligible={passkeyEligible}
      kavalkade={kavalkade}
      kavalkadeYear={KAVALKADE_YEAR}
      aiConsentUnanswered={aiConsentUnanswered}
    />
  );
}

/**
 * Spørsmålet om AI-tekster (#2561): kortet står så lenge spilleren ikke har
 * svart. Klarer vi ikke å lese svaret, vises ikke kortet. Det er trygt, fordi
 * navnet bare går til språkmodellen med «ja» (`lib/ai/consent.ts`).
 */
async function resolveAiConsentUnanswered(): Promise<boolean> {
  try {
    const supabase = await getServerClient();
    return (await readOwnAiConsent(supabase)) === null;
  } catch (err) {
    console.error('[aiConsent] Home could not read the answer, no card', err);
    return false;
  }
}

/**
 * Kavalkade-plassen (#2131): teaser fra 1. desember, lenke fra 24. desember til
 * 31. januar — og bare for spillere med minst én ferdig runde i året.
 *
 * Datoen spørres FØR databasen. Ti av årets tolv måneder er svaret `null`, og
 * da skal forsiden ikke betale for et oppslag ingen ser resultatet av.
 */
async function resolveKavalkadeSlot(
  userId: string,
): Promise<KavalkadeHomeSlot | null> {
  const slot = kavalkadeHomeSlot(new Date());
  if (slot === null) return null;
  const supabase = await getServerClient();
  const hasRound = await hasFinishedRoundInKavalkadeYear(supabase, userId);
  return hasRound ? slot : null;
}

async function fetchLatestProductUpdate(
  userId: string,
): Promise<ProductUpdateNudge | null> {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from('notifications')
    .select('id, payload, created_at')
    .eq('user_id', userId)
    .eq('kind', 'product_update')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      payload: {
        source_id: string;
        title: string;
        body: string;
        link?: string;
        cta_label?: string;
      };
      created_at: string;
    }>();

  if (!data) return null;

  return {
    notificationId: data.id,
    title: data.payload.title,
    body: data.payload.body,
    link: data.payload.link ?? null,
    ctaLabel: data.payload.cta_label ?? null,
  };
}
