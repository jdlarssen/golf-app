import type { ReactNode } from 'react';
import { ShareKavalkadeCardButton } from './ShareKavalkadeCardButton';
import {
  KAVALKADE_CARD_KINDS,
  type KavalkadeCardKind,
} from '@/lib/kavalkade/cardModel';
import type { KavalkadeCardId } from '@/lib/kavalkade/kavalkadeCards';

/**
 * Deleknappene, slått opp på kort-ID (#2130, epic #1040).
 *
 * Kortstokken (#2129) tar handlinger som et oppslag fra kort-ID til node, så
 * hverken kortet eller kortstokken trenger å vite hva deling er. Denne fila er
 * hele skjøten mellom K3 og K4.
 *
 * Bare kort som bærer et faktum får knapp. De to andre er utelatt med vilje, og
 * typen under gjør den utelatelsen til et valg noen må ta på nytt hvis
 * kortstokken vokser.
 */

/**
 * Kortene som med vilje IKKE kan deles, med grunnen.
 *
 * `Exclude<KavalkadeCardId, KavalkadeCardKind>` gjør dette til en
 * kompilator-vakt: legger K3 til et nytt kort, slutter denne å typesjekke til
 * noen enten gir kortet en slug i `KAVALKADE_CARD_KINDS` (og i CHECK-en i
 * `0183_kavalkade_shares.sql`) eller skriver det inn her med en begrunnelse.
 * En regel har ett hjem (felle 4, `docs/bug-prevention.md`).
 */
export const UNSHAREABLE_CARD_IDS: Record<
  Exclude<KavalkadeCardId, KavalkadeCardKind>,
  string
> = {
  'below-threshold': 'ingen personlige tall ennå — ingenting å dele',
  'gang-summary': 'ren opptelling av kretsen, ikke en prestasjon',
};

/**
 * Samme kompilator-vakt den andre veien: hver slug K4 deler på MÅ være et kort
 * K3 faktisk tegner, ellers ville knappen hengt i løse lufta.
 */
const SHAREABLE_CARD_IDS: readonly KavalkadeCardId[] = KAVALKADE_CARD_KINDS;

/**
 * Bygger oppslaget kortstokken tar imot. Kalles bare når kavalkaden er lagret:
 * før datoen finnes ingen rad, og da ville hver knapp bare hentet en 404.
 */
export function kavalkadeShareActions(
  year: number,
): Partial<Record<KavalkadeCardId, ReactNode>> {
  const actions: Partial<Record<KavalkadeCardId, ReactNode>> = {};
  for (const id of SHAREABLE_CARD_IDS) {
    actions[id] = (
      <ShareKavalkadeCardButton year={year} kind={id as KavalkadeCardKind} />
    );
  }
  return actions;
}
