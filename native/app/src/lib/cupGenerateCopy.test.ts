// #2752: ordene i «Fordel & generer» og starten er nettets, og hver kode har en setning.
import source from '../../../../messages/no.json';
import { CUP_PRESETS } from '../../../../lib/cup/cupTemplates';
import {
  FORMAT_LABELS,
  GENERATE_TEXT,
  START_TEXT,
  generateFailureText,
  spillehandicapText,
  startFailureText,
} from './cupGenerateCopy';
import { formatMessage } from './kavalkadeCopy';

const web = source.cup.generate;
const manage = source.cup.manage;

describe('ordlyden er nettets', () => {
  it.each<[keyof typeof GENERATE_TEXT, string]>([
    ['door', manage.doors.genererTitle],
    ['pageTitle', web.pageTitle],
    ['step1Heading', web.step1Heading],
    ['step2Heading', web.step4Heading],
    ['unevenTeams', web.unevenTeamsWarning],
    ['teamMin', web.step1ValidationMin],
    ['zeroMatches', web.step3ZeroMatchesMsg],
    ['overCap', web.overCapWarning],
    ['overCapSplitDay', web.overCapWarningSplitDay],
    ['capInfo', web.capInfoBanner],
    ['sessionCountsHeading', web.sessionCountsHeading],
    ['sessionCountsHint', web.sessionCountsHint],
    ['sessionCountValue', web.sessionCountValue],
    ['sessionCountMinus', web.sessionCountMinusAria],
    ['sessionCountPlus', web.sessionCountPlusAria],
    ['regenerate', web.regenerateButton],
    ['mot', web.mot],
    ['recapHeading', web.step4RecapHeading],
    ['courseTee', web.courseTeeLabel],
    ['matches', web.matchesLabel],
    ['matchesTotal', web.matchesTotalLabel],
    ['confirm', web.confirmButton],
    ['confirmPending', web.confirmPending],
    ['next', web.nextButton],
    ['emptyNoPlan', web.emptyStateNoPlan],
    ['emptyNoPlanLink', web.emptyStateNoPlanLink],
    ['emptyNoParticipants', web.emptyStateNoParticipants],
    ['emptyNoParticipantsLink', web.emptyStateNoParticipantsLink],
    ['flight', web.flightHeading],
    ['lineupHeading', web.lineupHeading],
    ['lineupHint', web.lineupHint],
    ['irishHint', web.irishGreensomeHint],
    ['teamStrokes', web.teamStrokesLabel],
    ['strokesHint', web.teamStrokesPrefillHint],
    ['spillehandicap', web.spillehandicapShort],
    ['hcpIndex', web.hcpIndexShort],
    ['front9', web.segmentFront9],
    ['back9', web.segmentBack9],
    ['matchPlayer', web.matchPlayerAria],
    ['lineupPlayer', web.lineupPlayerAria],
  ])('%s', (key, text) => {
    expect(GENERATE_TEXT[key]).toBe(text);
  });

  it('formatene', () => {
    expect(FORMAT_LABELS).toEqual({
      foursomes_matchplay: web.formatFoursomes,
      fourball_matchplay: web.formatFourball,
      singles_matchplay: web.formatSingles,
      greensome_matchplay: web.formatGreensome,
      chapman_matchplay: web.formatChapman,
      gruesome_matchplay: web.formatGruesome,
      best_ball: web.formatBestBall,
    });
  });

  it('starten', () => {
    expect(START_TEXT).toEqual({
      button: manage.startButton,
      pending: manage.startPending,
      hint: manage.startHint,
      started: manage.statusMessages.started,
      matchesGenerated: manage.statusMessages.matches_generated,
    });
  });

  it('alle oppsettene appen kan lage kamper av, har formater med en etikett', () => {
    for (const preset of CUP_PRESETS) {
      for (const format of preset.sessions) expect(FORMAT_LABELS[format]).toBeTruthy();
    }
  });
});

describe('generateFailureText', () => {
  it.each<[string, string]>([
    ['not_draft', web.errors.not_draft],
    ['missing_plan', web.errors.missing_plan],
    ['plan_tee', web.errors.plan_tee],
    ['no_matches', web.errors.no_matches],
    ['insert_failed', web.errors.insert_failed],
    ['profile_read_failed', web.errors.profile_read_failed],
    ['tee_off_in_past', web.errors.tee_off_in_past],
    ['rollback_failed', web.errors.rollback_failed],
    ['too_many_matches', formatMessage(web.errors.too_many_matches, { max: 36 })],
    ['too_many_players', formatMessage(web.errors.too_many_players, { max: 40 })],
  ])('%s', (code, text) => {
    expect(generateFailureText(code)).toBe(text);
  });

  it('en kode nettet ikke har, får nettets setning for alt annet', () => {
    expect(generateFailureText('not_members')).toBe(web.errors.insert_failed);
    expect(generateFailureText('invalid_source_match')).toBe(web.errors.insert_failed);
    expect(generateFailureText('load_failed')).toBe(web.errors.insert_failed);
  });

  it('«Sjekk nettet» bare når det er nettet', () => {
    expect(generateFailureText('offline')).toMatch(/Sjekk nettet/);
    expect(generateFailureText('network')).toMatch(/Sjekk nettet/);
    expect(generateFailureText('insert_failed')).not.toMatch(/nettet/);
    expect(generateFailureText('unauthorized')).toBe('Logg inn på nytt og prøv igjen.');
  });
});

describe('startFailureText', () => {
  it.each<[string, string]>([
    ['too_few_matches', manage.errors.too_few_matches],
    ['wrong_status', manage.errors.wrong_status],
    ['start_failed', manage.errors.start_failed],
    ['not_found', manage.errors.not_found],
    ['load_failed', manage.errors.start_failed],
  ])('%s', (code, text) => {
    expect(startFailureText(code)).toBe(text);
  });

  it('«Sjekk nettet» bare når det er nettet', () => {
    expect(startFailureText('offline')).toMatch(/Sjekk nettet/);
    expect(startFailureText('start_failed')).not.toMatch(/nettet/);
  });
});

it('spillehandicapet er et helt tall, og et negativt er et plusshandicap', () => {
  expect(spillehandicapText(13)).toBe('SH 13');
  expect(spillehandicapText(0)).toBe('SH 0');
  expect(spillehandicapText(-3)).toBe('SH +3');
});
