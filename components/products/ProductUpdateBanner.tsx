import { getServerClient } from '@/lib/supabase/server';
import { ProductUpdateBannerClient } from './ProductUpdateBannerClient';

/**
 * Server component shell — fetches latest unread product_update notification
 * for the current user (RLS via session client → user can only see own rows).
 *
 * Renders null when there's nothing to show, otherwise hands off to the
 * client component for dismiss-interaction.
 *
 * Mounts on `/` (app/page.tsx) just below the brand + bell row, above the
 * greeting header.
 */
export async function ProductUpdateBanner({ userId }: { userId: string | null }) {
  if (!userId) return null;

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

  return (
    <ProductUpdateBannerClient
      notificationId={data.id}
      title={data.payload.title}
      body={data.payload.body}
      link={data.payload.link ?? null}
      ctaLabel={data.payload.cta_label ?? null}
    />
  );
}
