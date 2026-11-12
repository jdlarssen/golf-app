// #2840 del 4: påmeldingsvalget i appen sier det samme som nettets steg 4, tegn for tegn.
import source from '../../../../messages/no.json';
import {
  OWN_TEAM_TEXT,
  REGISTRATION_MODE_CARDS,
  REGISTRATION_SOURCE_LABELS,
  REGISTRATION_TEXT,
  REGISTRATION_TYPE_LABELS,
  registrationSummary,
} from './registrationCopy';

const web = source.wizard;
const reg = web.sections.registration;

describe('påmeldingsvalget er nettets ord (#2840)', () => {
  it('overskriften, «Hva melder man på?» og bryteren for venner', () => {
    expect(REGISTRATION_TEXT.sourceTitle).toBe(web.stepTitle['4source']);
    expect(REGISTRATION_TEXT.whatLegend).toBe(reg.whatLegend);
    expect(REGISTRATION_TEXT.friendsSkipTitle).toBe(reg.friendsSkipTitle);
    expect(REGISTRATION_TEXT.friendsSkipHint).toBe(reg.friendsSkipHint);
    expect(REGISTRATION_TEXT.summaryLabel).toBe(reg.heading);
  });

  it('de tre kortene', () => {
    expect(REGISTRATION_MODE_CARDS.invite_only).toEqual({ title: reg.modeInviteTitle, hint: reg.modeInviteHint });
    expect(REGISTRATION_MODE_CARDS.manual_approval).toEqual({
      title: reg.modeApprovalTitle,
      hint: reg.modeApprovalHint,
    });
    expect(REGISTRATION_MODE_CARDS.open).toEqual({ title: reg.modeOpenTitle, hint: reg.modeOpenHint });
  });

  it('Individuelt og Lag', () => {
    expect(REGISTRATION_TYPE_LABELS).toEqual({ solo: reg.typeSoloTitle, team: reg.typeTeamTitle });
  });

  it('klar-stegets ord for hvordan spillerne kommer', () => {
    expect(REGISTRATION_SOURCE_LABELS).toEqual({
      invite_only: web.ready.checklist.source.invite,
      manual_approval: web.ready.checklist.source.approval,
      open: web.ready.checklist.source.open,
    });
  });
});

describe('tegningens ord (#2840, v3.1)', () => {
  it('oppsummeringen: «Åpen påmelding · lag»', () => {
    expect(registrationSummary('open', 'team')).toBe('Åpen påmelding · lag');
    expect(registrationSummary('manual_approval', 'solo')).toBe('Du godkjenner påmeldinger');
    expect(registrationSummary('invite_only', 'solo')).toBe('Privat');
    expect(REGISTRATION_TEXT.teamsSignUpThemselves).toBe('Lagene melder seg på selv');
  });

  it('merknaden og lista', () => {
    expect(REGISTRATION_TEXT.organiserOffRoster).toBe(
      'Du står ikke på lista nå. Når runden er publisert, melder du på laget ditt fra runden.',
    );
    expect(REGISTRATION_TEXT.listOptional).toBe('Vil du legge inn noen nå? Lista kan stå tom.');
  });

  it('kortet på runden', () => {
    expect(OWN_TEAM_TEXT).toEqual({
      title: 'Meld på laget ditt',
      body: 'Du står ikke på lista ennå. Meld på laget ditt, så blir du kaptein.',
      button: 'Meld på laget ditt',
    });
  });
});
