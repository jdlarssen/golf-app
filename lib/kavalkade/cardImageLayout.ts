/**
 * Målene på et delt kavalkade-kort (#2130, epic #1040).
 *
 * Webbens PNG-rute (`app/[locale]/kavalkade/[year]/card/[kind]/route.tsx`)
 * tegner kortet 1080 piksler bredt, med en høyde som følger innholdet. Appens
 * deleversjon (#2265) tegner det samme kortet i en tredjedel av størrelsen, og
 * telefonens 3x gir de samme pikslene. Begge leser målene her, så bildet ser
 * likt ut uansett hvor det ble delt fra (felle 4, `docs/bug-prevention.md`).
 *
 * Ren og I/O-fri (Type A).
 */
import type { KavalkadeCardModel } from './cardModel';

/** Bildets bredde i piksler. */
export const KAVALKADE_CARD_IMAGE_WIDTH = 1080;

/**
 * Det store tallet krymper når det er et navn og ikke to sifre, så «Dina
 * Fossum» får plass på samme kort som «79». Satori bryter på mellomrom.
 */
export function heroFontSize(value: string): number {
  if (value.length <= 8) return 116;
  if (value.length <= 14) return 84;
  return 60;
}

/**
 * Innholdstilpasset høyde: et kort med bare et navn blir ikke et høyt bilde med
 * tom nedre halvdel i chatten. Anslagene er med vilje rause, og footerens
 * `marginTop: auto` spiser opp slakken.
 */
export function computeCardHeight(model: KavalkadeCardModel): number {
  const titleLines = model.title.length > 26 ? 2 : 1;
  const heroSize = heroFontSize(model.hero.value);
  const heroLines = model.hero.value.length > 26 ? 2 : 1;

  let h = 72 /* topp-pad */ + 76 /* header */;
  h += 36 + titleLines * 80; // tittel
  h += 42; // skillelinje
  h += 8 + 56 + heroLines * Math.round(heroSize * 1.18) + (model.hero.caption ? 16 + 42 : 0) + 56;
  h += model.lines.length * 104;
  h += 24 + 2 + 104; // footer
  h += 72; // bunn-pad
  return h;
}
