// #2752: ordlyden er nettets der de to sier det samme, og hver kode har en setning.
import source from '../../../../messages/no.json';
import {
  AWARD_SETUP_TEXT,
  DETAILS_TEXT,
  JOIN_TEXT,
  PLAN_TEXT,
  PLAYERS_TEXT,
  PRESETS,
  REMOVE_TEXT,
  awardFailureText,
  detailsFailureText,
  firstNameOf,
  hcpLine,
  joinDecisionText,
  joinFailureText,
  joinLoadFailureText,
  joinStatusText,
  participantFailureText,
  planFailureText,
  playerCountLine,
  setupLoadFailureText,
} from './cupSetupCopy';

const web = source.cup;
const wizard = source.wizard.cupSetup;

describe('ordlyden er nettets', () => {
  it.each<[keyof typeof JOIN_TEXT, string]>([
    ['kicker', web.join.kicker],
    ['teams', web.join.teams],
    ['teeOffLine', web.join.teeOffLine],
    ['invite', web.join.invite],
    ['alreadyJoined', web.join.alreadyJoined],
    ['goToCup', web.join.goToCupButton],
    ['closed', web.join.closed],
    ['full', web.join.full],
    ['notMember', web.join.notMember],
    ['theClub', web.join.theClubFallback],
    ['joinClub', web.join.joinClubButton],
    ['profileIncomplete', web.join.profileIncomplete],
    ['completeProfile', web.join.completeProfileButton],
    ['join', web.join.joinButton],
    ['leave', web.join.leaveButton],
  ])('cup.join: %s', (key, value) => {
    expect(JOIN_TEXT[key]).toBe(value);
  });

  it.each(['joined', 'left', 'joined_self', 'left_self'] as const)('kvitteringen %s', (status) => {
    expect(joinStatusText(status)).toBe(web.join.statusMessages[status]);
  });

  it('en status uten kvittering sier ingenting', () => {
    expect(joinStatusText('already_joined')).toBeNull();
    expect(joinStatusText('not_joined')).toBeNull();
  });

  it.each(['not_found', 'closed', 'profile_incomplete', 'not_member', 'not_joined', 'read_failed', 'save_failed'] as const)(
    'cup.join.errors: %s',
    (code) => {
      expect(joinFailureText(code, 40)).toBe(web.join.errors[code]);
    },
  );

  it('full har taket i seg', () => {
    expect(joinFailureText('full', 40)).toBe('Cupen er full. Den tar 40 spillere.');
  });

  it.each<[keyof typeof DETAILS_TEXT, string]>([
    ['name', wizard.cupNameLabel],
    ['namePlaceholder', wizard.cupNamePlaceholder],
    ['teamsHeading', wizard.teamNamesLegend],
    ['team1', wizard.team1Label],
    ['team1Placeholder', wizard.team1Placeholder],
    ['team2', wizard.team2Label],
    ['team2Placeholder', wizard.team2Placeholder],
    ['pointsHeading', wizard.pointsWeightLegend],
    ['pointsHint', wizard.pointsWeightHint],
    ['win', wizard.winPointsLabel],
    ['tie', wizard.tiePointsLabel],
  ])('wizard.cupSetup: %s', (key, value) => {
    expect(DETAILS_TEXT[key]).toBe(value);
  });

  it.each(['cup_name', 'cup_team_1', 'cup_team_2', 'cup_team_dup', 'cup_win_points', 'cup_tie_points', 'cup_insert_failed'] as const)(
    'cup.create.errors: %s',
    (code) => {
      expect(detailsFailureText(code)).toBe(web.create.errors[code]);
    },
  );

  it.each<[keyof typeof PLAN_TEXT, string]>([
    ['teeOffLabel', web.plan.teeOffLabel],
    ['teeOffHint', web.plan.teeOffHint],
    ['formatHeading', web.plan.formatHeading],
    ['customName', web.plan.customPresetName],
    ['customDescription', web.plan.customPresetDescription],
    ['strategyHeading', web.plan.strategyHeading],
    ['strategyHandicap', web.plan.strategyHandicapLabel],
    ['strategyHandicapDescription', web.plan.strategyHandicapDescription],
    ['strategyRandom', web.plan.strategyRandomLabel],
    ['strategyRandomDescription', web.plan.strategyRandomDescription],
    ['bestBallLabel', web.plan.bestBallLabel],
    ['bestBallHint', web.plan.bestBallHint],
  ])('cup.plan: %s', (key, value) => {
    expect(PLAN_TEXT[key]).toBe(value);
  });

  it.each([
    'plan_course',
    'plan_tee',
    'plan_preset',
    'plan_strategy',
    'plan_sessions',
    'plan_best_ball',
    'plan_tee_off_invalid',
    'plan_tee_off_past',
    'not_found',
    'not_draft',
  ] as const)('cup.plan.errors: %s', (code) => {
    expect(planFailureText(code)).toBe(web.plan.errors[code]);
  });

  it.each(PRESETS.map((preset) => [preset.id, preset] as const))('cup.presets: %s', (id, preset) => {
    expect(preset.name).toBe(web.presets[id].name);
    expect(preset.description).toBe(web.presets[id].description);
  });

  it.each<[keyof typeof AWARD_SETUP_TEXT, string]>([
    ['heading', web.sideAwards.heading],
    ['hint', web.sideAwards.hint],
    ['empty', web.sideAwards.empty],
    ['kind', web.sideAwards.kindLabel],
    ['hole', web.sideAwards.holeLabel],
    ['points', web.sideAwards.pointsLabel],
    ['winners', web.sideAwards.winnersColumnLabel],
    ['winnersHelp', web.sideAwards.winnersHelp],
    ['addRow', web.sideAwards.addRow],
  ])('cup.sideAwards: %s', (key, value) => {
    expect(AWARD_SETUP_TEXT[key]).toBe(value);
  });

  it.each([
    ['invalid_side_award', web.sideAwards.errors.invalid],
    ['duplicate_side_award', web.sideAwards.errors.duplicate],
    ['not_found', web.sideAwards.errors.notFound],
    ['cup_finished', web.sideAwards.errors.cupFinished],
    ['cup_started', web.sideAwards.errors.cupStarted],
    ['winners_already_registered', web.sideAwards.errors.winnersRegistered],
    ['save_failed', web.sideAwards.errors.saveFailed],
  ])('cup.sideAwards.errors: %s', (code, value) => {
    expect(awardFailureText(code)).toBe(value);
  });

  it.each<[keyof typeof PLAYERS_TEXT, string]>([
    ['pageTitle', web.participants.pageTitle],
    ['enrolledHeading', web.participants.enrolledHeading],
    ['countCapped', web.participants.countCapped],
    ['empty', web.participants.emptyParticipants],
    ['remove', web.participants.removeButton],
    ['addHeading', web.participants.addHeading],
    ['add', web.participants.addButton],
    ['allAdded', web.participants.allAdded],
    ['emptyCandidates', web.participants.emptyCandidates],
    ['pendingBadge', web.participants.pendingBadge],
    ['shareHeading', web.participants.share.heading],
    ['shareHelper', web.participants.share.helper],
    ['added', web.participants.statusMessages.participant_added],
    ['removed', web.participants.statusMessages.participant_removed],
  ])('cup.participants: %s', (key, value) => {
    expect(PLAYERS_TEXT[key]).toBe(value);
  });

  it.each<[keyof typeof REMOVE_TEXT, string]>([
    ['kicker', web.participants.remove.brassRibbon],
    ['heading', web.participants.remove.heading],
    ['body', web.participants.remove.body],
    ['captain', web.participants.remove.captain],
    ['canReAdd', web.participants.remove.canReAdd],
    ['confirm', web.participants.remove.confirmButton],
    ['pending', web.participants.remove.pending],
    ['cancel', web.participants.remove.cancel],
    ['lockedHeading', web.participants.remove.lockedHeading],
    ['lockedBody', web.participants.remove.lockedBody],
    ['fallbackFirstName', web.participants.remove.fallbackFirstName],
  ])('cup.participants.remove: %s', (key, value) => {
    expect(REMOVE_TEXT[key]).toBe(value);
  });
});

describe('setningene', () => {
  it('uten nett sier hver skjerm det samme', () => {
    const needsNet = 'Du trenger nett for å gjøre dette. Sjekk nettet og prøv igjen.';
    for (const text of [
      detailsFailureText('offline'),
      planFailureText('network'),
      awardFailureText('offline'),
      participantFailureText('offline', 40),
      joinFailureText('offline', 40),
      joinLoadFailureText('offline'),
      setupLoadFailureText('offline'),
    ]) {
      expect(text).toBe(needsNet);
    }
  });

  it('en ukjent kode faller på den trygge setningen', () => {
    expect(detailsFailureText('x')).toBe(web.create.errors.cup_insert_failed);
    expect(awardFailureText('x')).toBe(web.sideAwards.errors.saveFailed);
    expect(joinFailureText('x', 1)).toBe(web.join.errors.save_failed);
    expect(planFailureText('x')).toContain('Prøv igjen');
    expect(participantFailureText('x', 1)).toContain('Prøv igjen');
  });

  it('kampene som ikke fikk planen, sier at planen ER lagret', () => {
    expect(planFailureText('plan_matches_not_updated')).toContain('lagret');
  });

  it('taket i «for mange spillere»', () => {
    expect(participantFailureText('too_many_players', 40)).toContain('40');
  });

  it.each([
    ['closed', web.join.closed],
    ['profile_incomplete', web.join.profileIncomplete],
    ['already_joined', web.join.alreadyJoined],
    ['can_join', web.join.invite],
    ['not_found', web.join.errors.not_found],
  ] as const)('tilstanden %s', (decision, text) => {
    expect(joinDecisionText(decision, { cap: 40, clubName: null })).toBe(text);
  });

  it('full og klubb fyller inn', () => {
    expect(joinDecisionText('full', { cap: 40, clubName: null })).toContain('40 spillere');
    expect(joinDecisionText('not_member', { cap: 40, clubName: 'Stiklestad GK' })).toBe(
      'Denne cupen er for medlemmer av Stiklestad GK.',
    );
    expect(joinDecisionText('not_member', { cap: 40, clubName: null })).toBe('Denne cupen er for medlemmer av klubben.');
  });

  it('tallet på lista', () => {
    expect(playerCountLine(6, 40)).toBe('6 av 40 påmeldte');
    expect(playerCountLine(6, null)).toBe('6 påmeldte');
    expect(playerCountLine(1, null)).toBe('1 påmeldt');
    expect(playerCountLine(0, null)).toBe('Ingen påmeldte');
  });

  it('handicap med norsk komma', () => {
    expect(hcpLine(12.4)).toBe('HCP 12,4');
    expect(hcpLine(8)).toBe('HCP 8,0');
  });

  it('fornavnet', () => {
    expect(firstNameOf('Per Putter')).toBe('Per');
    expect(firstNameOf('  ')).toBe('Spilleren');
  });
});
