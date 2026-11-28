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
 * Tekstbredden i tallboksen: bildet minus sidenes 72, boksens 48 og rammens 2
 * på hver side.
 */
const HERO_TEXT_WIDTH = KAVALKADE_CARD_IMAGE_WIDTH - 2 * (72 + 48 + 2);

/**
 * Snittbredden på et tegn i Fraunces 600, i em. Målt på navnene i Satori
 * (#3020: 0,50–0,51), og satt litt raust så anslaget heller gir en linje for
 * mye enn for lite.
 */
const HERO_CHAR_EM = 0.53;

/** Flere linjer enn dette i tallboksen, og navnene krymper ett hakk til (#3020). */
const HERO_MAX_LINES = 3;

/**
 * Hvor mange linjer teksten brytes på i tallboksen. Satori bryter på
 * mellomrom, så ordene legges på linja ett for ett, som i ruta. Et hardt
 * mellomrom (U+00A0, fornavn og initial ved likhet) bryter ikke, så bare
 * vanlige mellomrom deler ordene her.
 */
export function heroLineCount(value: string, fontSize: number): number {
  const perLine = Math.floor(HERO_TEXT_WIDTH / (HERO_CHAR_EM * fontSize));
  let lines = 1;
  let used = 0;
  for (const word of value.split(/[ \t\n]+/).filter(Boolean)) {
    if (used === 0) used = word.length;
    else if (used + 1 + word.length <= perLine) used += 1 + word.length;
    else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/**
 * Det store tallet krymper når det er et navn og ikke to sifre, så «Dina
 * Fossum» får plass på samme kort som «79». Flere navn ved likt antall (#3020)
 * får 60, og krymper til 48 bare når de ellers ville brukt mer enn tre linjer.
 */
export function heroFontSize(value: string): number {
  if (value.length <= 8) return 116;
  if (value.length <= 14) return 84;
  return heroLineCount(value, 60) <= HERO_MAX_LINES ? 60 : 48;
}

/**
 * Innholdstilpasset høyde: et kort med bare et navn blir ikke et høyt bilde med
 * tom nedre halvdel i chatten. Anslagene er med vilje rause, og footerens
 * `marginTop: auto` spiser opp slakken.
 */
export function computeCardHeight(model: KavalkadeCardModel): number {
  const titleLines = model.title.length > 26 ? 2 : 1;
  const heroSize = heroFontSize(model.hero.value);
  const heroLines = heroLineCount(model.hero.value, heroSize);

  let h = 72 /* topp-pad */ + 76 /* header */;
  h += 36 + titleLines * 80; // tittel
  h += 42; // skillelinje
  h += 8 + 56 + heroLines * Math.round(heroSize * 1.18) + (model.hero.caption ? 16 + 42 : 0) + 56;
  h += model.lines.length * 104;
  h += 24 + 2 + 104; // footer
  h += 72; // bunn-pad
  return h;
}
