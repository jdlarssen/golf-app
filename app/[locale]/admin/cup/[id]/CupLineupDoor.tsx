import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';

/**
 * Døra til uttaks-rommet (#1884), for arrangøren.
 *
 * Egen komponent framfor en fjerde dør i `CupDoorsSection`, av to grunner:
 *
 *  1. Dørene der vises KUN mens cupen er utkast. Uttaket lever gjennom hele
 *     cupen — økt 2 og 3 åpnes mens det spilles, akkurat som i en ekte Ryder
 *     Cup — så døra må overleve starten.
 *  2. Den vises bare når cupen faktisk har en kaptein. En cup uten kapteiner
 *     ser nøyaktig ut som før (SK7): ingen ekstra dør, ingen ny beslutning å ta.
 *
 * Selve utnevnelsen skjer i Spillere-rommet, som alltid har lag-velgeren — det
 * er der arrangøren oppdager at muligheten finnes.
 */
export async function CupLineupDoor({
  tournamentId,
  isClub,
  groupId,
  isFinished,
}: {
  tournamentId: string;
  isClub: boolean;
  groupId: string | null;
  isFinished: boolean;
}) {
  if (isFinished) return null;

  const admin = getAdminClient();
  const [{ count: captainCount }, { count: sessionCount }] = await Promise.all([
    admin
      .from('tournament_participants')
      .select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('is_captain', true),
    admin
      .from('cup_lineup_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId),
  ]);

  if (!captainCount) return null;

  const t = await getTranslations('cup');
  const href =
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}/uttak`
      : `/admin/cup/${tournamentId}/uttak`;

  return (
    <section className="mb-5">
      <SmartLink href={href} data-testid="cup-door-uttak" className="block rounded-2xl">
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-serif text-base text-text">
              {t('manage.doors.uttakTitle')}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {t('manage.doors.uttakSubtitle', { count: sessionCount ?? 0 })}
            </p>
          </div>
          <span aria-hidden className="text-muted">
            →
          </span>
        </Card>
      </SmartLink>
    </section>
  );
}
