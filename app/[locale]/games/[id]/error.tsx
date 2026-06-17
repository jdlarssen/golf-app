'use client';

import { useParams } from 'next/navigation';
import { ErrorScreen } from '@/components/ui/ErrorScreen';

/**
 * Error-grense for hele spill-segmentet (#680). Fanger ukontrollerte throws fra
 * hull-, leaderboard-, submit- og (home)-sidene + alle nestede game-sider — der
 * hver server-komponent kaster på enhver Supabase-feil (se issue #680). Feil i
 * selve `games/[id]/layout.tsx` bobler videre til `[locale]/error.tsx`.
 *
 * «Til spillet» tar brukeren tilbake til spill-hjem; `id` leses fra ruten.
 */
export default function GameError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const params = useParams<{ id?: string }>();
  const id = typeof params?.id === 'string' ? params.id : undefined;

  return (
    <ErrorScreen
      error={error}
      retry={unstable_retry}
      back={
        id
          ? { href: `/games/${id}`, labelKey: 'toGame' }
          : { href: '/', labelKey: 'toHome' }
      }
      context="game-error-boundary"
    />
  );
}
