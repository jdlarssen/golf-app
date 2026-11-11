// native/app/src/lib/syncChipCopy.ts
// #2348: tekstene i lagringsbrikka og arket «Trygt på telefonen» på hullsiden.
//
// Samme arbeidsdeling som de andre `*Copy.ts`: skjermen viser, teksten bor her.
// Teksten er artboardet `Synk-forslag` ordrett, med «appen» der tegningen sier
// «runden» (eierens svar 2): appen sender ved oppstart, i forgrunnen, når
// nettet kommer tilbake og hvert 30. sekund, ikke bare når runden åpnes.
// Karantenen forklares med SyncBanners egne tekster (`SYNC_BANNER_TEXT`), så et
// slag som ikke kom fram beskrives likt begge steder.
import type { SyncCellState, SyncChipState } from '../../../../lib/sync/roundSyncState';
import { formatHoleList } from './syncBannerCopy';

export const SYNC_CHIP_TEXT = {
  saved: 'Alt er lagret',
  /** Bare utslagsvalg venter: de er ikke slag, så brikka teller dem ikke. */
  pendingNoStrokes: 'Lagret på telefonen',
  /** Skjermleserens navn på brikka; teksten i brikka er verdien. */
  a11yLabel: 'Lagring',
  sheetTitle: 'Trygt på telefonen',
  noCoverage: 'Du har ikke dekning her.',
  allSent: 'Alle slagene er sendt.',
  keepGoing:
    'Fortsett å taste som vanlig. Lukker du appen, blir slagene liggende på telefonen til du åpner den igjen med nett.',
  retryNow: 'Prøv å sende nå',
  continueRound: 'Fortsett runden',
} as const;

export const SYNC_CELL_TEXT: Record<SyncCellState, { mark: string; label: string }> = {
  sent: { mark: '✓', label: 'sendt' },
  pending: { mark: '●', label: 'på telefonen' },
  quarantined: { mark: '!', label: 'ikke lagret' },
  empty: { mark: '–', label: 'ikke tastet' },
};

/** «3 slag på telefonen», «1 hull ikke lagret», «Alt er lagret». */
export function syncChipText(
  state: SyncChipState,
  { pendingScoreCount, quarantinedHoleCount }: { pendingScoreCount: number; quarantinedHoleCount: number },
): string {
  if (state === 'quarantined') return `${quarantinedHoleCount} hull ikke lagret`;
  if (state === 'pending') {
    return pendingScoreCount > 0
      ? `${pendingScoreCount} slag på telefonen`
      : SYNC_CHIP_TEXT.pendingNoStrokes;
  }
  return SYNC_CHIP_TEXT.saved;
}

/**
 * Setningen om det som venter. «…sendes av seg selv når nettet er tilbake»
 * bare når det er nettet som mangler; ellers er grunnen en annen (utløpt
 * innlogging, serverfeil), og da lover teksten bare at appen prøver igjen.
 */
export function pendingText({
  holes,
  pendingScoreCount,
  pendingTeeShotCount,
  waitingForNetwork,
}: {
  holes: readonly number[];
  pendingScoreCount: number;
  pendingTeeShotCount: number;
  waitingForNetwork: boolean;
}): string {
  const list = formatHoleList(holes);
  const count = pendingScoreCount > 0 ? pendingScoreCount : pendingTeeShotCount;
  const one = count === 1;
  const subject =
    pendingScoreCount > 0
      ? one
        ? `Slaget fra hull ${list}`
        : `Slagene fra hull ${list}`
      : one
        ? `Utslagsvalget fra hull ${list}`
        : `Utslagsvalgene fra hull ${list}`;
  return waitingForNetwork
    ? `${subject} er lagret på telefonen og sendes av seg selv når nettet er tilbake.`
    : `${subject} er lagret på telefonen. Appen prøver å sende ${one ? 'det' : 'dem'} igjen.`;
}

export function retakeHoleText(hole: number): string {
  return `Tast hull ${hole} på nytt`;
}

/** «Hull 7: på telefonen» — det skjermleseren sier for en rute i rutenettet. */
export function cellA11yLabel(hole: number, state: SyncCellState): string {
  return `Hull ${hole}: ${SYNC_CELL_TEXT[state].label}`;
}
