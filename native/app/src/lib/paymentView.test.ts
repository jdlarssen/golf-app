// #2749: hvilken tilstand kontingentkortet har, og linjene i premiebordet (Type A).
import type { GamePrize } from '../../../../lib/games/prizes';
import { paymentView, prizeRows } from './paymentView';

describe('paymentView', () => {
  const base = { entryFeeKr: 200, paymentLink: null, paidAt: null };

  it.each([
    ['en https-lenke', 'https://vipps.no/betal', { kind: 'link', amountKr: 200, url: 'https://vipps.no/betal' }],
    ['HTTP i store bokstaver', 'HTTP://pay.example', { kind: 'link', amountKr: 200, url: 'HTTP://pay.example' }],
    ['et Vipps-nummer', ' 12345 ', { kind: 'vipps', amountKr: 200, number: '12345' }],
    // Aldri en lenke: nettets XSS-vakt (`isPaymentUrl`).
    ['javascript:', 'javascript:alert(1)', { kind: 'vipps', amountKr: 200, number: 'javascript:alert(1)' }],
    ['vipps://', 'vipps://pay', { kind: 'vipps', amountKr: 200, number: 'vipps://pay' }],
    ['tom', '', { kind: 'arrange', amountKr: 200 }],
    ['bare mellomrom', '   ', { kind: 'arrange', amountKr: 200 }],
  ])('%s gir riktig tilstand', (_name, paymentLink, expected) => {
    expect(paymentView({ ...base, paymentLink })).toEqual(expected);
  });

  it('ingen lenke (null) gir «avtal med arrangøren»', () => {
    expect(paymentView(base)).toEqual({ kind: 'arrange', amountKr: 200 });
  });

  it('betalt slår lenka', () => {
    expect(paymentView({ ...base, paymentLink: 'https://x.no', paidAt: '2026-11-01T10:00:00Z' })).toEqual({
      kind: 'paid',
    });
  });

  it.each([[0], [undefined], [-5]])('kontingent %p gir ikke noe kort, heller ikke når betalt', (fee) => {
    expect(paymentView({ entryFeeKr: fee, paymentLink: '12345', paidAt: 'x' })).toEqual({ kind: 'none' });
  });
});

const prize = (category: GamePrize['category'], position: number, sponsor: string | null = null): GamePrize => ({
  category,
  position,
  description: `${category} ${position}`,
  sponsor,
  sponsorLogoPath: null,
});

describe('prizeRows', () => {
  it('ingen premier gir tom liste', () => {
    expect(prizeRows([])).toEqual([]);
    expect(prizeRows(undefined)).toEqual([]);
  });

  it('pallplassene først med medalje, så lengste drive og nærmest pinnen', () => {
    const rows = prizeRows([
      prize('closest_to_pin', 1, 'Kafé Fjorden'),
      prize('placement', 2),
      prize('longest_drive', 1),
      prize('placement', 1, 'Byneset Sport'),
      prize('placement', 3),
    ]);
    expect(rows.map((r) => [r.label, r.medal, r.sponsorLine])).toEqual([
      ['1. plass', 1, 'Sponset av Byneset Sport'],
      ['2. plass', 2, null],
      ['3. plass', 3, null],
      ['Lengste drive', null, null],
      ['Nærmest pinnen', null, 'Sponset av Kafé Fjorden'],
    ]);
  });

  it('to slott av samme slag får nummer', () => {
    const rows = prizeRows([prize('longest_drive', 2), prize('longest_drive', 1)]);
    expect(rows.map((r) => r.label)).toEqual(['Lengste drive 1', 'Lengste drive 2']);
  });

  it('et slott med bare logo og uten navn får ingen sponsorlinje', () => {
    const [row] = prizeRows([{ ...prize('placement', 1), sponsorLogoPath: 'u/logo.webp' }]);
    expect(row.sponsorLine).toBeNull();
  });
});
