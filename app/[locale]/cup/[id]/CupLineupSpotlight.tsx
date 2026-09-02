import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { loadCupLineupAccess } from '@/lib/cup/lineupAccess';
import type { CupSessionFormat } from '@/lib/cup/cupTemplates';

/**
 * Avdekkings-øyeblikket på cup-siden (#1884), pluss kapteinens vei inn.
 *
 * Cup-presentasjonsfilosofien: ett kort, seremoni-tone. Kortet forteller at
 * kampene er klare — selve oppstillingen står i match-lista rett under, så
 * dette gjentar den ikke.
 *
 * Kostnaden på en varmt trafikkert, world-read side holdes nede av at den
 * FØRSTE lesingen avgjør alt: har cupen ingen uttaks-økter, returnerer
 * komponenten før den slår opp hvem du er. Cuper uten kapteiner betaler altså
 * ett indeksert count-oppslag og ikke noe mer.
 */
export async function CupLineupSpotlight({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const admin = getAdminClient();
  const { data: sessions } = await admin
    .from('cup_lineup_sessions')
    .select('format, slot_count, revealed_at')
    .eq('tournament_id', tournamentId)
    .order('session_index', { ascending: true });

  if (!sessions || sessions.length === 0) return null;

  const t = await getTranslations('cup');
  const tf = await getTranslations('modes');

  // Nyeste avdekkede økt er seremonien vi feirer. Eldre avdekkinger er
  // historie og står i match-lista.
  const revealed = sessions.filter((s) => s.revealed_at !== null);
  const latest = revealed[revealed.length - 1];
  const hasPending = sessions.some((s) => s.revealed_at === null);

  // Døra vises kun for dem som faktisk har noe å gjøre der.
  const access = hasPending ? await loadCupLineupAccess(tournamentId) : null;
  const showDoor = access !== null && access.role.kind !== 'none';

  if (!latest && !showDoor) return null;

  return (
    <div className="mb-6 space-y-3">
      {latest && (
        <Card data-testid="cup-lineup-revealed-card">
          <p className="font-serif text-lg text-text">
            {t('public.lineupRevealedTitle')}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t('public.lineupRevealedBody', {
              format: tf(
                latest.format as CupSessionFormat as Parameters<typeof tf>[0],
              ),
              count: latest.slot_count as number,
            })}
          </p>
        </Card>
      )}

      {showDoor && (
        <SmartLink
          href={`/admin/cup/${tournamentId}/uttak`}
          data-testid="cup-lineup-door"
          className="block rounded-2xl"
        >
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-serif text-base text-text">
                {t('public.lineupDoor')}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t('public.lineupDoorSubtitle')}
              </p>
            </div>
            <span aria-hidden className="text-muted">
              →
            </span>
          </Card>
        </SmartLink>
      )}
    </div>
  );
}
