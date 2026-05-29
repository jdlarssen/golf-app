import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Player-rettet «korte regler» per spillemodus (#299). Egen kilde fra
 * `formats.short_description` (DB), som er admin-terse for wizard-scanning —
 * denne er vennligere og forklarer nok til at en spiller tør å spille en
 * modus de ikke kjenner.
 *
 * Bevisst statisk i kode (ikke DB-kolonne): innholdet er stabilt (golf-regler
 * endres ikke), version-controlled, humanizer-sjekket og testbart uten
 * migrasjon eller admin-UI. Se `.forge/contracts/299-mode-info-for-players.md`.
 *
 * Brukes av `ModeGuideCard` på spillerens game-side og på `/spillformer`.
 * `Record<GameMode, ModeGuide>` tvinger en entry for hver modus ved compile;
 * `modeGuide.test.ts` fanger tomt innhold.
 */
export type ModeGuide = {
  /** Ett-setnings sammendrag, alltid synlig på kortet. */
  summary: string;
  /** 2–3 korte punkter: hvordan poeng teller, hvordan du vinner, lag/solo. */
  points: string[];
};

export const MODE_GUIDE: Record<GameMode, ModeGuide> = {
  stableford: {
    summary:
      'Du spiller for deg selv og samler poeng på hvert hull. Jo bedre du gjør det mot par, jo flere poeng.',
    points: [
      'Par gir 2 poeng, ett over gir 1, ett under gir 3, og så videre.',
      'Slagene du får på handikap regnes med før poengene settes.',
      'Høyest poengsum til slutt vinner.',
    ],
  },
  best_ball: {
    summary:
      'Dere er to på lag, og på hvert hull teller bare den beste netto-scoren av dere to.',
    points: [
      'Begge spiller hele runden, men laget tar med den laveste av de to på hvert hull.',
      'Netto er antall slag minus slagene du får på hullet.',
      'Lavest lagtotal vinner.',
    ],
  },
  solo_strokeplay: {
    summary:
      'Vanlig slagspill: du teller alle slagene dine, og færrest netto-slag vinner.',
    points: [
      'Netto er totalen din minus slagene du får på handikap.',
      'Du spiller for deg selv, ingen lag.',
      'Lavest sum etter 18 hull vinner.',
    ],
  },
  texas_scramble: {
    summary:
      'Laget spiller én ball: alle slår, dere plukker det beste slaget, og alle slår derfra igjen.',
    points: [
      'Slik fortsetter dere helt i hull — én score per hull for hele laget.',
      'Laget får et felles handikap som trekkes fra.',
      'Lavest lagtotal vinner.',
    ],
  },
  singles_matchplay: {
    summary:
      'Én mot én, hull for hull. Den som bruker færrest slag på et hull vinner hullet.',
    points: [
      'Det er hull som teller, ikke total score — vinn flere hull enn motstanderen.',
      'Slagene du får på handikap er med når hullet avgjøres.',
      'Den som leder med flere hull enn det er igjen å spille, har vunnet.',
    ],
  },
  fourball_matchplay: {
    summary:
      'To mot to, hull for hull. Hver spiller spiller sin egen ball, og lagets beste score teller på hvert hull.',
    points: [
      'Laget med best netto-score vinner hullet.',
      'Det er antall vunne hull som avgjør, ikke total score.',
      'Laget som leder med flere hull enn det er igjen, har vunnet.',
    ],
  },
  foursomes_matchplay: {
    summary:
      'To mot to, men dere deler én ball og slår annenhver gang hele runden.',
    points: [
      'Den ene slår ut på oddetallshull, den andre på partallshull, så bytter dere på.',
      'Laget med best score vinner hullet — det er hull som teller, ikke total.',
      'Laget som leder med flere hull enn det er igjen, har vunnet.',
    ],
  },
  wolf: {
    summary:
      'Fire spillere bytter på å være «ulv». Ulven velger på hvert hull om laget skal være to mot to, eller om ulven spiller alene mot de tre andre.',
    points: [
      'Velger ulven å spille alene og vinner hullet, gir det mest poeng. Men det er også mest å tape.',
      'Dere bytter på å være ulv gjennom runden.',
      'Flest poeng til slutt vinner.',
    ],
  },
  nassau: {
    summary:
      'Én runde, tre oppgjør: de første 9 hullene, de siste 9, og alle 18 samlet.',
    points: [
      'Hvert oppgjør avgjøres for seg. Du kan tape de første 9 og likevel ta de siste.',
      'Du kan spille det brutto eller netto med handikap, alt etter hva som er valgt.',
      'Vinner du alle tre, har du gjort rent bord.',
    ],
  },
};
