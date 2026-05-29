import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';

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
  modified_stableford: {
    summary:
      'Stableford med proff-skala: du blir belønnet hardt for å satse, men straffet for de virkelig dårlige hullene. Her kan poengene gå i minus.',
    points: [
      'Birdie gir 2 poeng, eagle 5, albatross 8. Par gir 0.',
      'Bogey trekker 1 poeng, dobbeltbogey eller verre trekker 3. Du kan altså havne under null.',
      'Slagene du får på handikap regnes med, og høyest poengsum vinner.',
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
      'Slik fortsetter dere til ballen er i hull. Laget får én score per hull.',
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
  skins: {
    summary:
      'Hvert hull er verdt ett «skin». Den som har lavest score på hullet helt alene, vinner skinnet.',
    points: [
      'Deler to eller flere den laveste scoren, ruller skinnet videre. Neste hull er da verdt to.',
      'Du kan spille det brutto eller netto med handikap, alt etter hva som er valgt.',
      'Flest skins til slutt vinner.',
    ],
  },
  bingo_bango_bongo: {
    summary:
      'Tre poeng er på spill på hvert hull — én for å nå green først, én for å ligge nærmest hullet når alle er på green, og én for å gå i hull først.',
    points: [
      'Du trenger ikke de fleste slagene for å vinne — rekkefølge og presisjon teller.',
      'Du spiller for deg selv, og alle tre poengene på et hull kan gå til én og samme spiller.',
      'Flest poeng etter 18 hull vinner.',
    ],
  },
  nines: {
    summary:
      'Tre spillere kjemper om poeng på hvert hull. Lavest score tar mest, høyest tar minst.',
    points: [
      'Nines deler ut ni poeng per hull: fem til lavest, tre til nest, ett til høyest.',
      'Split Sixes deler ut seks: fire, to og null.',
      'Likt på et hull? Da deler dere poengene for plassene dere står på.',
      'Flest poeng sammenlagt vinner.',
    ],
  },
  round_robin: {
    summary:
      'Fire spillere bytter partner hvert sjette hull. Du spiller med og mot alle de tre andre i løpet av runden.',
    points: [
      'Hvert hull spilles som besteball matchplay: lagets beste netto teller, og lavest beste netto vinner hullet.',
      'Den som vinner hullet for laget sitt, får ett poeng. Delt hull gir ingenting til noen.',
      'Flest vunne hull etter 18 vinner.',
    ],
  },
};

/**
 * Egen guide for 4BBB-varianten av Stableford (team_size 2, #282). Stableford-
 * familien deler `game_mode` mellom solo og 4BBB, så MODE_GUIDE-oppslaget på
 * game_mode alene ville vist solo-teksten («Du spiller for deg selv …») på et
 * lag-spill. `resolveModeGuide` velger denne i stedet når team_size er 2.
 */
export const STABLEFORD_4BBB_GUIDE: ModeGuide = {
  summary:
    'Dere er to på lag. På hvert hull teller den beste poengsummen av dere to.',
  points: [
    'Begge spiller hele runden og samler stableford-poeng hver for seg.',
    'På hvert hull tar laget med den høyeste poengsummen av de to.',
    'Høyest lagtotal vinner.',
  ],
};

/**
 * Velger riktig spillform-guide. For stableford-familien med team_size 2
 * (4BBB) returneres `STABLEFORD_4BBB_GUIDE`; alle andre tilfeller (inkl.
 * solo-stableford) bruker det vanlige game_mode-oppslaget. Konsumenter som
 * ikke kjenner team_size kan fortsatt slå opp `MODE_GUIDE[mode]` direkte.
 */
export function resolveModeGuide(mode: GameMode, teamSize: number): ModeGuide {
  if (isStablefordFamily(mode) && teamSize === 2) return STABLEFORD_4BBB_GUIDE;
  return MODE_GUIDE[mode];
}
