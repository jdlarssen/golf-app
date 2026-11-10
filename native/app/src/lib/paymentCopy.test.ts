// #2749: kontingentkortet og premiebordet har nettsidens ord (Type A), låst
// tegn for tegn mot `messages/no.json`.
import source from '../../../../messages/no.json';
import { PAYMENT_TEXT, PRIZE_TEXT, WIZARD_FEE_TEXT } from './paymentCopy';

const payment = source.payment;
const prizes = source.prizes;

describe('PAYMENT_TEXT', () => {
  it.each([
    ['label', PAYMENT_TEXT.label, payment.label],
    ['payVia', PAYMENT_TEXT.payVia, payment.payVia],
    ['copy', PAYMENT_TEXT.copy, payment.copy],
    ['copied', PAYMENT_TEXT.copied, payment.copied],
    ['arrangeWithHost', PAYMENT_TEXT.arrangeWithHost, payment.arrangeWithHost],
    ['paidBadge', PAYMENT_TEXT.paidBadge, payment.paidBadge],
  ])('%s er nettets', (_key, app, web) => {
    expect(app).toBe(web);
  });

  it('vippsTo er nettets med nummeret satt inn', () => {
    expect(PAYMENT_TEXT.vippsTo('12345')).toBe(payment.vippsTo.replace('{number}', '12345'));
  });

  it('beløpet står med mellomrom og «kr»', () => {
    expect(PAYMENT_TEXT.amount(200)).toBe('200 kr');
    expect(PAYMENT_TEXT.amount(1500)).toBe('1 500 kr');
  });
});

describe('PRIZE_TEXT', () => {
  it.each([
    ['boardTitle', PRIZE_TEXT.boardTitle, prizes.boardTitle],
    ['ldLabel', PRIZE_TEXT.ldLabel, prizes.ldLabel],
    ['ctpLabel', PRIZE_TEXT.ctpLabel, prizes.ctpLabel],
  ])('%s er nettets', (_key, app, web) => {
    expect(app).toBe(web);
  });

  it('placementLabel og sponsoredBy er nettets med verdien satt inn', () => {
    expect(PRIZE_TEXT.placementLabel(2)).toBe(prizes.placementLabel.replace('{position}', '2'));
    expect(PRIZE_TEXT.sponsoredBy('Byneset Sport')).toBe(
      prizes.sponsoredBy.replace('{sponsor}', 'Byneset Sport'),
    );
  });

  // Nettets flertallsregel (`toggleCount`): «one» for 1, «other» ellers.
  it.each([
    [1, '1 premie'],
    [2, '2 premier'],
    [5, '5 premier'],
  ])('count(%i) er «%s», som nettets toggleCount', (n, expected) => {
    expect(PRIZE_TEXT.count(n)).toBe(expected);
    const toggle = source.wizard.sections.prizes.toggleCount;
    const web = (n === 1 ? /one \{([^}]*)\}/ : /other \{([^}]*)\}/).exec(toggle)![1].replace('#', String(n));
    expect(PRIZE_TEXT.count(n)).toBe(web);
  });
});

describe('WIZARD_FEE_TEXT', () => {
  const registration = source.wizard.sections.registration;
  const wizardPrizes = source.wizard.sections.prizes;

  it.each([
    ['paymentLegend', WIZARD_FEE_TEXT.paymentLegend, registration.paymentLegend],
    ['paymentHint', WIZARD_FEE_TEXT.paymentHint, registration.paymentHint],
    ['entryFeeLabel', WIZARD_FEE_TEXT.entryFeeLabel, registration.entryFeeLabel],
    ['entryFeePlaceholder', WIZARD_FEE_TEXT.entryFeePlaceholder, registration.entryFeePlaceholder],
    ['paymentLinkLabel', WIZARD_FEE_TEXT.paymentLinkLabel, registration.paymentLinkLabel],
    ['paymentLinkPlaceholder', WIZARD_FEE_TEXT.paymentLinkPlaceholder, registration.paymentLinkPlaceholder],
    ['paymentLinkHint', WIZARD_FEE_TEXT.paymentLinkHint, registration.paymentLinkHint],
    ['prizesLegend', WIZARD_FEE_TEXT.prizesLegend, wizardPrizes.legend],
    ['toggleAdd', WIZARD_FEE_TEXT.toggleAdd, wizardPrizes.toggleAdd],
    ['toggleHide', WIZARD_FEE_TEXT.toggleHide, wizardPrizes.toggleHide],
    ['prizePlaceholder', WIZARD_FEE_TEXT.prizePlaceholder, wizardPrizes.prizePlaceholder],
    ['sponsorLabel', WIZARD_FEE_TEXT.sponsorLabel, wizardPrizes.sponsorLabel],
  ])('%s er nettets', (_key, app, web) => {
    expect(app).toBe(web);
  });

  it('aria-etikettene er nettets med slottet satt inn', () => {
    expect(WIZARD_FEE_TEXT.prizeAriaLabel('1. plass')).toBe(wizardPrizes.prizeAriaLabel.replace('{slot}', '1. plass'));
    expect(WIZARD_FEE_TEXT.sponsorAriaLabel('1. plass')).toBe(
      wizardPrizes.sponsorAriaLabel.replace('{slot}', '1. plass'),
    );
  });
});
