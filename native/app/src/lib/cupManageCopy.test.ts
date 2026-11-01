// #2752: ordlyden er nettets der de to sier det samme, og hver kode har en setning.
import type { AppCupWithdrawalMatch } from '../../../../lib/cup/appCupManageView';
import { MAX_PERSONAL_CUP_PLAYERS } from '../../../../lib/cup/limits';
import {
  MANAGE_TEXT,
  SWAP_TEXT,
  WITHDRAW_TEXT,
  manageLoadFailureText,
  manageNoticeText,
  swapFailureText,
  withdrawFailureText,
  withdrawalMatchLine,
} from './cupManageCopy';
import { CUP_TEXT } from './cupCopy';
import source from '../../../../messages/no.json';

const web = source.cup;

describe('ordlyden er nettets', () => {
  it.each<[keyof typeof WITHDRAW_TEXT, string]>([
    ['kicker', web.withdraw.kicker],
    ['headingAdmin', web.withdraw.headingAdmin],
    ['headingSelf', web.withdraw.headingSelf],
    ['warning', web.withdraw.warningAdmin],
    ['warning', web.withdraw.warningSelf],
    ['matchesHeading', web.withdraw.matchesHeading],
    ['untouchedHeading', web.withdraw.untouchedHeading],
    ['untouchedNote', web.withdraw.untouchedNote],
    ['outcomeHalved', web.withdraw.outcomeHalved],
    ['outcomeWalkover', web.withdraw.outcomeWalkover],
    ['outcomePlayOn', web.withdraw.outcomePlayOn],
    ['teeOffMissing', web.withdraw.teeOffMissing],
    ['playOnLegend', web.withdraw.playOnLegend],
    ['playOnYes', web.withdraw.playOnYes],
    ['playOnNo', web.withdraw.playOnNo],
    ['playOnHelp', web.withdraw.playOnHelp],
    ['nothingPending', web.withdraw.nothingPending],
    ['alreadyWithdrawnSelf', web.withdraw.alreadyWithdrawnSelf],
    ['withdrawButtonAdmin', web.withdraw.withdrawButtonAdmin],
    ['withdrawButtonSelf', web.withdraw.withdrawButtonSelf],
    ['withdrawPending', web.withdraw.withdrawPending],
    ['cancelButton', web.withdraw.cancelButton],
    ['selfNote', web.withdraw.selfNote],
    ['undoHeading', web.withdraw.undoHeading],
    ['undoBody', web.withdraw.undoBody],
    ['undoButton', web.withdraw.undoButton],
    ['undoPending', web.withdraw.undoPending],
  ])('trekk: %s', (key, text) => {
    expect(WITHDRAW_TEXT[key]).toBe(text);
  });

  it.each<[keyof typeof SWAP_TEXT, string]>([
    ['heading', web.swap.openButton],
    ['outLabel', web.swap.outLabel],
    ['inLabel', web.swap.inLabel],
    ['submitButton', web.swap.submitButton],
    ['submitPending', web.swap.submitPending],
    ['cancelButton', web.swap.cancelButton],
    ['noReserves', web.swap.noReserves],
  ])('bytte: %s', (key, text) => {
    expect(SWAP_TEXT[key]).toBe(text);
  });

  it.each<[keyof typeof MANAGE_TEXT, string]>([
    ['withdrawnChip', web.manage.withdrawnChip],
    ['withdrawLink', web.manage.withdrawLink],
    ['undoWithdrawLink', web.manage.undoWithdrawLink],
    ['playOnPendingHeading', web.manage.playOnPendingHeading],
    ['playerSwapped', web.manage.statusMessages.player_swapped],
    ['playerWithdrawn', web.manage.statusMessages.player_withdrawn],
    ['playerWithdrawnPartial', web.manage.statusMessages.player_withdrawn_partial],
    ['withdrawalUndone', web.manage.statusMessages.withdrawal_undone],
    ['playOnSaved', web.manage.statusMessages.play_on_saved],
  ])('styringen: %s', (key, text) => {
    expect(MANAGE_TEXT[key]).toBe(text);
  });

  it('spillerens lenke og banner', () => {
    expect(CUP_TEXT.withdrawSelfLink).toBe(web.public.withdrawSelfLink);
    expect(CUP_TEXT.withdrawnBanner).toBe(web.public.withdrawnBanner);
  });

  it.each(Object.entries(web.withdraw.errors).filter(([code]) => code !== 'not_authed'))(
    'trekkets feil %s',
    (code, text) => {
      expect(withdrawFailureText(code)).toBe(text);
    },
  );

  it.each(
    Object.entries(web.swap.errors).filter(([code]) => !['too_many_players', 'unexpected'].includes(code)),
  )('byttets feil %s', (code, text) => {
    expect(swapFailureText(code)).toBe(text);
  });

  it('taket i en personlig cup kommer fra regelens eget hjem', () => {
    expect(swapFailureText('too_many_players')).toBe(
      web.swap.errors.too_many_players.replace('{cap}', String(MAX_PERSONAL_CUP_PLAYERS)),
    );
  });
});

describe('koder som ikke er kjent', () => {
  it('et trekk faller til nettets «prøv igjen», og aldri til koden selv', () => {
    expect(withdrawFailureText('noe_nytt')).toBe(web.withdraw.errors.withdraw_failed);
    expect(swapFailureText('noe_nytt')).toBe(web.swap.errors.swap_failed);
  });

  it('uten nett sier begge det samme', () => {
    expect(withdrawFailureText('offline')).toBe(swapFailureText('offline'));
    expect(withdrawFailureText('offline')).toContain('nett');
  });

  it('hva skjermen sier når den ikke får lest', () => {
    expect(manageLoadFailureText('not_found')).toContain('Fant ikke cupen');
    expect(manageLoadFailureText('not_manager')).toBe('Det er arrangøren som styrer cupen.');
    expect(manageLoadFailureText('load_failed')).toContain('Sjekk nettet');
  });
});

describe('linjene', () => {
  const match = (over: Partial<AppCupWithdrawalMatch>): AppCupWithdrawalMatch => ({
    gameId: 'g',
    label: 'Singel 1',
    when: 'man. 2. nov',
    outcome: { kind: 'halved' },
    canPlayOn: false,
    playOn: false,
    partnerName: null,
    ...over,
  });

  it('konsekvensen, ordrett som på nettsiden', () => {
    expect(withdrawalMatchLine(match({}))).toBe('Singel 1 · man. 2. nov → halveres');
    expect(withdrawalMatchLine(match({ outcome: { kind: 'walkover', teamName: 'Team Sør' } }))).toBe(
      'Singel 1 · man. 2. nov → walkover til Team Sør — under 30 minutter før start',
    );
    expect(withdrawalMatchLine(match({ outcome: { kind: 'playOn', partnerName: 'Kari' } }))).toBe(
      'Singel 1 · man. 2. nov → Kari spiller alene',
    );
  });

  it('uten navn og uten tid', () => {
    expect(withdrawalMatchLine(match({ label: null, when: null }))).toBe('Match · uten klokkeslett → halveres');
  });

  it('kvitteringene', () => {
    expect(manageNoticeText('player_swapped')).toBe(web.manage.statusMessages.player_swapped);
    expect(manageNoticeText('player_withdrawn_partial')).toBe(web.manage.statusMessages.player_withdrawn_partial);
  });
});
