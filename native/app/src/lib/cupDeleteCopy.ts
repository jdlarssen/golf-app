// #2752: slette en cup og en økt i appen. Cup-skjermen bruker nettets ord, låst i
// `cupDeleteCopy.test.ts`. Nettet har ingen bekreftelse for en økt, så de ordene er appens.
import { SETUP_APP_TEXT } from './cupSetupCopy';

export const DELETE_TEXT = {
  kicker: 'Bekreft sletting',
  link: 'Slett cupen',
  heading: 'Slett «{name}»?',
  versus: 'mot',
  warning: 'Cupen er ikke startet ennå. Genererte matcher som ikke er spilt, slettes for alltid sammen med cupen.',
  permanentHeading: 'Slettes permanent',
  cupEntry: 'Cupen «{name}»',
  rosterEntry: 'Spillerliste og master-leaderboard',
  neverPlayedNote:
    '{count} {count, plural, one {genererte match som ikke er spilt} other {genererte matcher som ikke er spilt}} slettes for alltid.',
  keptNote:
    '{count} spilte {count, plural, one {match} other {matcher}} forblir som frittstående spill (cup-koblingen fjernes).',
  irreversibleNote: 'Handlingen kan ikke angres.',
  deleteButton: 'Slett cupen for alltid',
  pending: 'Sletter …',
  cancel: 'Avbryt',
  failed: 'Slettingen feilet. Prøv igjen om litt.',
  deleted: 'Cupen «{name}» er slettet.',
} as const;

export const DELETE_APP_TEXT = {
  lockedHeading: 'Cupen er startet',
  lockedBody: 'En cup som er i gang, kan ikke slettes i appen.',
} as const;

export const SESSION_DELETE_TEXT = {
  heading: 'Slett økten?',
  button: 'Slett økten',
  deliveredNone: 'Ingen lag har levert ennå.',
  deliveredOne: 'Ett lag har levert. Uttaket blir borte.',
  deliveredBoth: 'Begge lag har levert. Uttakene blir borte.',
  noMatches: 'Ingen kamper er laget ennå, så ingen runder går tapt.',
} as const;

/** Hvorfor slettingen ikke gikk. Bare nettet får skylden for nettet. */
export function deleteFailureText(reason: string): string {
  if (reason === 'offline' || reason === 'network') return SETUP_APP_TEXT.needsNet;
  return DELETE_TEXT.failed;
}
