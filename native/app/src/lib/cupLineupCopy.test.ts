// #2752: ordene i uttaket er nettets, og hver kode har en setning.
import source from '../../../../messages/no.json';
import { LINEUP_ROOM_TEXT, LINEUP_TEXT, ROLE_TEXT, lineupFailureText, lineupLoadFailureText } from './cupLineupCopy';
import { participantFailureText, SETUP_APP_TEXT } from './cupSetupCopy';

const web = source.cup.lineup;
const participants = source.cup.participants;

describe('ordlyden er nettets', () => {
  it.each(Object.keys(LINEUP_TEXT) as (keyof typeof LINEUP_TEXT)[])('%s', (key) => {
    expect(LINEUP_TEXT[key]).toBe(web[key]);
  });

  it.each(['not_allowed', 'not_found', 'save_failed', 'lineup_incomplete', 'lineup_duplicate_player', 'lineup_not_in_squad', 'lineup_slot_shape', 'lineup_squad_too_small', 'lineup_squad_changed', 'lineup_revealed', 'lineup_not_both_submitted', 'lineup_already_submitted', 'lineup_format', 'lineup_slot_count', 'too_many_matches', 'lineup_planned_total', 'lineup_planned_total_missing', 'planned_saved_target_failed', 'cup_finished', 'missing_plan', 'plan_tee', 'insert_failed', 'profile_read_failed', 'invalid_source_match', 'rollback_failed', 'reveal_undo_failed'] as const)(
    'koden %s',
    (code) => {
      expect(lineupFailureText(code)).toBe(web.errors[code]);
    },
  );

  it('lista over koder er hele nettets, utenom reserven', () => {
    const codes = Object.keys(web.errors).filter((code) => code !== 'unexpected');
    for (const code of codes) expect(lineupFailureText(code)).toBe(web.errors[code as keyof typeof web.errors]);
  });

  it('rollene', () => {
    expect(ROLE_TEXT.roleHelper).toBe(participants.roleHelper);
    expect(ROLE_TEXT.captainLabel).toBe(participants.captainLabel);
    expect(ROLE_TEXT.captainBadge).toBe(participants.captainBadge);
    expect(ROLE_TEXT.saveRole).toBe(participants.saveRole);
    expect(ROLE_TEXT.teamSelect).toBe(participants.teamSelectAria);
    expect(ROLE_TEXT.captain).toBe(participants.captainAria);
    expect(ROLE_TEXT.saveRoleLabel).toBe(participants.saveRoleAria);
  });

  it.each(['not_participant', 'captain_needs_team', 'team_taken', 'invalid_team', 'not_allowed'] as const)('rollens kode %s', (code) => {
    expect(participantFailureText(code, 0)).toBe(participants.errors[code]);
  });

  it('dørene og kortet', () => {
    expect(LINEUP_ROOM_TEXT).toEqual({
      organizerDoor: source.cup.manage.doors.uttakTitle,
      organizerDoorSub: source.cup.manage.doors.uttakSubtitle,
      captainDoor: source.cup.public.lineupDoor,
      captainDoorSub: source.cup.public.lineupDoorSubtitle,
      revealedTitle: source.cup.public.lineupRevealedTitle,
      revealedBody: source.cup.public.lineupRevealedBody,
    });
  });
});

describe('hva appen sier når det ikke er en regel', () => {
  it('«Sjekk nettet» bare når det er nettet', () => {
    expect(lineupFailureText('offline')).toBe(SETUP_APP_TEXT.needsNet);
    expect(lineupFailureText('network')).toBe(SETUP_APP_TEXT.needsNet);
    expect(lineupFailureText('save_failed')).not.toMatch(/nettet/);
    expect(lineupFailureText('ukjent')).toBe(web.errors.save_failed);
    expect(lineupLoadFailureText('load_failed')).not.toMatch(/nettet/);
    expect(lineupLoadFailureText('offline')).toMatch(/Sjekk nettet/);
  });

  it('ingen tilgang og ingen cup har egne setninger', () => {
    expect(lineupLoadFailureText('not_allowed')).toBe(web.errors.not_allowed);
    expect(lineupLoadFailureText('not_found')).toBe(web.errors.not_found);
  });
});
