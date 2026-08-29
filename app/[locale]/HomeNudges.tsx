import { getServerClient } from '@/lib/supabase/server';
import { getPasskeyEnrollAccess } from '@/lib/auth/passkeyEnrollAccess';
import {
  HomeNudgeRail,
  type ProductUpdateNudge,
} from './HomeNudgeRail';

/**
 * Server-halvdelen av nudge-køen på Hjem (#1797, kontrakt #1069 K6). Avklarer
 * de to server-avgjorte plassene parallelt — siste uleste produktnytt (RLS via
 * session-client → brukeren ser kun egne rader) og passkey-utrullingsgaten —
 * og gir klient-orkestratoren `HomeNudgeRail` et ferdig verdikt for begge.
 * Suspense-wrappes på mount-stedet så oppslagene aldri blokkerer side-skallet.
 */
export async function HomeNudges({ userId }: { userId: string }) {
  const [passkeyEligible, productUpdate] = await Promise.all([
    getPasskeyEnrollAccess(),
    fetchLatestProductUpdate(userId),
  ]);

  return (
    <HomeNudgeRail
      productUpdate={productUpdate}
      passkeyEligible={passkeyEligible}
    />
  );
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
