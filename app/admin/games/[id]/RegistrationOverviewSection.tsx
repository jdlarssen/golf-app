import { getServerClient } from '@/lib/supabase/server';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';
import { CopyShareLinkButton } from './CopyShareLinkButton';

type Props = {
  gameId: string;
  registrationMode: 'invite_only' | 'manual_approval' | 'open';
  shortId: string;
  selfRegisteredCount: number;
};

/**
 * Server-component for «Påmelding»-seksjonen på admin/games/[id] (#199).
 * Telles pending-requests via en lett count-query, og rendrer kun seksjonen
 * når mode != invite_only — invite-only-spill har ingen selv-påmelding så
 * seksjonen ville vært irrelevant der.
 *
 * `selfRegisteredCount` regnes ut hos caller (vi har allerede game_players-
 * raden ut fra players-fetchen i page.tsx — ingen ny round-trip her).
 */
export async function RegistrationOverviewSection({
  gameId,
  registrationMode,
  shortId,
  selfRegisteredCount,
}: Props) {
  if (registrationMode === 'invite_only') return null;

  const supabase = await getServerClient();

  // Telleren brukes kun for manual_approval (pending er meningsløst i open).
  // For open viser vi i stedet "antall selv-påmeldte spillere" som caller
  // har regnet ut.
  let pendingCount = 0;
  if (registrationMode === 'manual_approval') {
    const { count, error } = await supabase
      .from('game_registration_requests')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('status', 'pending');
    if (error) {
      console.error('[RegistrationOverviewSection] count failed', error);
    }
    pendingCount = count ?? 0;
  }

  const shareUrl = `https://tornygolf.no/signup/${shortId}`;
  const modeLabel =
    registrationMode === 'open'
      ? 'Fri påmelding'
      : 'Manuell godkjenning';

  return (
    <section className="mt-1.5">
      <MiniRibbon>Påmelding</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="space-y-3 px-3.5 pb-3.5 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Modus
              </p>
              <p className="mt-0.5 font-serif text-[15px] text-text">
                {modeLabel}
              </p>
            </div>
            {registrationMode === 'manual_approval' ? (
              <div className="text-right">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Venter
                </p>
                <p className="mt-0.5 font-serif text-[20px] font-medium tabular-nums text-text">
                  {pendingCount}
                </p>
              </div>
            ) : (
              <div className="text-right">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Påmeldt
                </p>
                <p className="mt-0.5 font-serif text-[20px] font-medium tabular-nums text-text">
                  {selfRegisteredCount}
                </p>
              </div>
            )}
          </div>

          <CopyShareLinkButton shareUrl={shareUrl} />

          <SmartLink
            href={`/admin/games/${gameId}/signups`}
            className="block min-h-[44px] rounded-full border border-border bg-surface px-4 py-3 text-center text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
          >
            Vis alle påmeldinger →
          </SmartLink>
        </div>
      </div>
    </section>
  );
}
