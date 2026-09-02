import { getTranslations } from 'next-intl/server';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { previewReminder } from '@/lib/games/remindUnsubmitted';

/**
 * Purreknappen i «disse mangler kort»-blokken på avslutt-flatene (#1889).
 *
 * Uten den er eneste vei videre fra avslutt-skjermen å markere de manglende som
 * trukket — en destruktiv handling presentert som det ene alternativet. Purring
 * fantes alt på webben, men bare på admin-status-siden, altså et annet rom enn
 * det arrangøren står i når problemet oppstår.
 *
 * Tre flater viser den samme blokken (oppretterens `/games/[id]/avslutt`, og
 * admins `/avslutt` + `/avslutt-likevel`). Knappen, setningen når ingen er å
 * purre, og valget mellom dem bor derfor HER og ikke tre steder — det er den
 * ene tingen som ellers ville drevet fra hverandre (AGENTS trap 4). Det hver
 * flate eier selv er porten: `remindAction` er bundet på kallstedet, med
 * `requireAdminOrCreator` (oppretter) eller `requireAdmin` (admin) foran seg.
 *
 * Antallet leses med `previewReminder` — nøyaktig samme utvalg som sendingen
 * bruker — så knappeteksten aldri lover flere purringer enn den utløser.
 */
export async function RemindMissing({
  gameId,
  remindAction,
  justReminded,
}: {
  gameId: string;
  /** Bundet server-action. Hver flate gater selv og redirecter til seg selv. */
  remindAction: () => void | Promise<void>;
  /** `?status=reminded` i URL-en — redirecten action-en akkurat gjorde. */
  justReminded: boolean;
}) {
  const t = await getTranslations('game.remind');

  // `ok: false` betyr «finnes ikke» eller «ikke aktivt lenger». Flatene har
  // allerede gatet på begge (notFound / redirect) før de rendrer denne, så det
  // er et kappløp vi taper stille: ingen knapp, ingen ny feiltekst.
  const preview = await previewReminder(gameId);
  const targets = preview.ok ? preview.targets : 0;

  return (
    <div className="space-y-3">
      {justReminded && <Banner tone="success">{t('sent')}</Banner>}
      {targets > 0 ? (
        // Sekundær-knapp med vilje: avslutt-handlingen er fortsatt flatens
        // hovedknapp, og to fylte knapper etter hverandre hadde gjort begge
        // svakere. Purring skal være det lette valget, ikke det høyeste.
        <form action={remindAction}>
          <SubmitButton
            variant="secondary"
            className="w-full"
            pendingLabel={t('pending')}
          >
            {t('button', { count: targets })}
          </SubmitButton>
        </form>
      ) : (
        <p className="px-1 font-sans text-[13px] leading-relaxed text-muted">
          {t('none')}
        </p>
      )}
    </div>
  );
}
