// native/app/src/lib/syncBannerCopy.ts
// Native #1980: tekstene i appens SyncBanner (`components/sync/SyncBanner.tsx`).
//
// Samme arbeidsdeling som de andre `*Copy.ts`: skjermen viser, teksten bor her.
// Alt er webbens `messages/no.json → SyncBanner` tegn for tegn, og
// `syncBannerCopy.test.ts` låser det: et slag som ikke kom fram skal forklares
// likt på begge flater. ICU-flertallet kan ikke leses i appen, så grenene står
// hver for seg og testen sjekker at begge finnes i kilden.

export const SYNC_BANNER_TEXT = {
  /** `quarantineHoles`, med `{holes}` byttet ut. */
  quarantineHoles: 'Hull {holes} ble ikke lagret.',
  /** `quarantineOtherGame`, grenene `one` og `other` (`#` er antallet). */
  quarantineOtherGameOne: 'Ett slag fra en annen runde ble ikke lagret.',
  quarantineOtherGameOther: '# slag fra en annen runde ble ikke lagret.',
  abandonedMessage: 'Kunne ikke lagre {count} slag. Kontakt arrangøren.',
  quarantineRecoveryHint:
    'Tast slaget på nytt mens runden er i gang, så prøver appen å sende det igjen.',
  quarantineDetailsTitle: 'Tekniske detaljer',
  quarantineDismiss: 'Fjern varselet',
  quarantineDismissConfirm:
    'Vil du fjerne varselet? Slagene er ikke sendt til arrangøren. Tallene blir bare stående på denne telefonen.',
  retry: 'Prøv igjen',
  retrying: 'Sender…',
  conflictNotice:
    'Hull {holeNumber} ble endret av en medspiller. Det nyeste tallet gjelder nå.',
  conflictNoticeMarker:
    'Hull {holeNumber}: tallet du førte for en medspiller ble endret. Det nyeste gjelder nå.',
  conflictDismiss: 'OK',
} as const;

/**
 * «3», «3 og 7», «3, 7 og 12» — det webbens `formatHoleList` får fra
 * `Intl.ListFormat('no')`. Bygget for hånd fordi Hermes ikke kan stoles på
 * for `Intl` (se `hermes-intl`-fellene i native/app).
 */
export function formatHoleList(holes: readonly number[]): string {
  const parts = holes.map(String);
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} og ${parts[parts.length - 1]}`;
}

export function quarantineHolesText(holes: readonly number[]): string {
  return SYNC_BANNER_TEXT.quarantineHoles.replace('{holes}', formatHoleList(holes));
}

export function quarantineOtherGameText(count: number): string {
  return count === 1
    ? SYNC_BANNER_TEXT.quarantineOtherGameOne
    : SYNC_BANNER_TEXT.quarantineOtherGameOther.replace('#', String(count));
}

export function abandonedText(count: number): string {
  return SYNC_BANNER_TEXT.abandonedMessage.replace('{count}', String(count));
}

export function conflictText(holeNumber: number, forOwnScore: boolean | undefined): string {
  // #1368: rader fra før feltet fantes har ingen `forOwnScore` — de var alltid
  // konflikter på eget slag.
  const template =
    forOwnScore === false
      ? SYNC_BANNER_TEXT.conflictNoticeMarker
      : SYNC_BANNER_TEXT.conflictNotice;
  return template.replace('{holeNumber}', String(holeNumber));
}
