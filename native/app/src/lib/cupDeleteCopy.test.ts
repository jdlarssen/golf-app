// #2752: ordene på slette-skjermen er nettets.
import source from '../../../../messages/no.json';
import { DELETE_APP_TEXT, DELETE_TEXT, SESSION_DELETE_TEXT, deleteFailureText } from './cupDeleteCopy';
import { LINEUP_TEXT } from './cupLineupCopy';
import { SETUP_APP_TEXT } from './cupSetupCopy';
import { formatMessage } from './kavalkadeCopy';

const web = source.cup.delete;

describe('ordlyden er nettets', () => {
  it('skjermen', () => {
    expect(DELETE_TEXT).toEqual({
      kicker: web.brassRibbon,
      link: source.cup.manage.deleteLink,
      heading: web.heading,
      versus: source.cup.manage.mot,
      warning: web.warnings.draft,
      permanentHeading: web.permanentHeading,
      cupEntry: web.cupEntry,
      rosterEntry: web.rosterEntry,
      neverPlayedNote: web.neverPlayedNote,
      irreversibleNote: web.irreversibleNote,
      deleteButton: web.deleteButton,
      pending: web.deletePending,
      cancel: web.cancelButton,
      failed: web.errors.delete_failed,
      deleted: source.cup.manage.deletedMessage,
    });
  });

  it('knappen på økta', () => {
    expect(SESSION_DELETE_TEXT.button).toBe(source.cup.lineup.deleteSession);
    expect(SESSION_DELETE_TEXT.button).toBe(LINEUP_TEXT.deleteSession);
  });
});

describe('tallet på matcher', () => {
  it('bøyes, også i appens egen formatering', () => {
    expect(formatMessage(DELETE_TEXT.neverPlayedNote, { count: 1 })).toBe('1 genererte match som ikke er spilt slettes for alltid.');
    expect(formatMessage(DELETE_TEXT.neverPlayedNote, { count: 4 })).toBe('4 genererte matcher som ikke er spilt slettes for alltid.');
  });
});

describe('hva appen sier når det ikke går', () => {
  it('«Sjekk nettet» bare når det er nettet', () => {
    expect(deleteFailureText('offline')).toBe(SETUP_APP_TEXT.needsNet);
    expect(deleteFailureText('network')).toBe(SETUP_APP_TEXT.needsNet);
    expect(deleteFailureText('delete_failed')).toBe(web.errors.delete_failed);
    expect(deleteFailureText('delete_failed')).not.toMatch(/nettet/);
  });

  it('appens egne setninger er på plass', () => {
    expect(DELETE_APP_TEXT.lockedHeading).toBe('Cupen er startet');
  });
});
