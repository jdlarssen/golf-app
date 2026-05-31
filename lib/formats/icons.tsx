// Slug → ikon-komponent for wizard step 2's FormatGrid og CupSetup multi-select.
// Speiler stilen i `app/admin/games/new/ModeSelector.tsx` (28x28 line-icons,
// stroke=currentColor, rounded caps) slik at gridet leser likt som dagens
// tile-velger. Ikon-keys matcher formats.icon_key i DB-en (0047-migrasjonen).
//
// Når nye formats lander uten en dedikert ikon-mapping, fallback-er vi til
// et generisk flagg-ikon. Da unngår vi at gridet krasjer, og admin får et
// signal om at noen burde legge til riktig ikon.

import type { ReactNode } from 'react';

function StablefordIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4.5" width="21" height="19" rx="2" />
      <line x1="10.5" y1="4.5" x2="10.5" y2="23.5" />
      <line x1="17.5" y1="4.5" x2="17.5" y2="23.5" />
      <text x="7" y="17" fontSize="9" fontFamily="serif" fontWeight="600" stroke="none" fill="currentColor" textAnchor="middle">2</text>
      <text x="14" y="17" fontSize="9" fontFamily="serif" fontWeight="600" stroke="none" fill="currentColor" textAnchor="middle">3</text>
      <text x="21" y="17" fontSize="9" fontFamily="serif" fontWeight="600" stroke="none" fill="currentColor" textAnchor="middle">4</text>
    </svg>
  );
}

function BestBallIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="3" x2="6" y2="12" />
      <path d="M 6 4 L 11 5.5 L 6 7 Z" fill="currentColor" stroke="none" />
      <line x1="18" y1="3" x2="18" y2="12" />
      <path d="M 18 4 L 23 5.5 L 18 7 Z" fill="currentColor" stroke="none" />
      <line x1="6" y1="16" x2="6" y2="25" />
      <path d="M 6 17 L 11 18.5 L 6 20 Z" fill="currentColor" stroke="none" />
      <line x1="18" y1="16" x2="18" y2="25" />
      <path d="M 18 17 L 23 18.5 L 18 20 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MatchplayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="5" x2="6" y2="23" />
      <path d="M 6 6 L 11 7.5 L 6 9 Z" fill="currentColor" stroke="none" />
      <line x1="22" y1="5" x2="22" y2="23" />
      <path d="M 22 6 L 17 7.5 L 22 9 Z" fill="currentColor" stroke="none" />
      <circle cx="14" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TexasScrambleIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="14" y1="3" x2="14" y2="18" />
      <path d="M 14 4 L 21 5.5 L 14 7 Z" fill="currentColor" stroke="none" />
      <circle cx="8" cy="22" r="2" />
      <circle cx="14" cy="22" r="2" />
      <circle cx="20" cy="22" r="2" />
    </svg>
  );
}

function StrokeplayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5.5" y="4.5" width="14" height="19" rx="1.5" />
      <line x1="8.5" y1="9.5" x2="16.5" y2="9.5" />
      <line x1="8.5" y1="13" x2="16.5" y2="13" />
      <line x1="8.5" y1="16.5" x2="16.5" y2="16.5" />
      <line x1="22" y1="7" x2="22" y2="19" />
      <path d="M 21 19 L 22 21.5 L 23 19 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Fourball matchplay: speilet matchplay-flagg med to baller per side (2v2).
// Holder samme språk som de andre tile-ikonene.
function FourballMatchplayIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="6" y1="3" x2="6" y2="14" />
      <path d="M 6 4 L 11 5.5 L 6 7 Z" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.5" />
      <circle cx="8.5" cy="18" r="1.5" />
      <line x1="22" y1="3" x2="22" y2="14" />
      <path d="M 22 4 L 17 5.5 L 22 7 Z" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="18" r="1.5" />
      <circle cx="23.5" cy="18" r="1.5" />
      <circle cx="14" cy="22.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Bingo Bango Bongo: tre poeng per hull (bingo/bango/bongo). Tre sirkler i
// triangulær arrangering — én per prestasjon. Holder samme språk som de andre
// tile-ikonene (line-icons, 28x28, stroke=currentColor).
function BingoBangoBongoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Bingo — øverst: første ball på green */}
      <circle cx="14" cy="7" r="3.5" />
      {/* Bango — nede til venstre: nærmest hullet */}
      <circle cx="7.5" cy="20" r="3.5" />
      {/* Bongo — nede til høyre: først i hull */}
      <circle cx="20.5" cy="20" r="3.5" />
      {/* Linjer mellom sirklene */}
      <line x1="11" y1="9.5" x2="9" y2="17" />
      <line x1="17" y1="9.5" x2="19" y2="17" />
      <line x1="11" y1="20" x2="17" y2="20" />
    </svg>
  );
}

// Nines / Split Sixes: tre spillere, poeng-deling per hull (9 eller 6 poeng totalt).
// Tre pinner i en rad med fallende høyde illustrerer poeng-rangering (5–3–1 / 4–2–0).
function NinesIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Tre pinner med fallende høyde — 1. plass høyest */}
      <line x1="7" y1="5" x2="7" y2="22" />
      <path d="M 7 6 L 12 7.5 L 7 9 Z" fill="currentColor" stroke="none" />
      <line x1="14" y1="9" x2="14" y2="22" />
      <path d="M 14 10 L 19 11.5 L 14 13 Z" fill="currentColor" stroke="none" />
      <line x1="21" y1="13" x2="21" y2="22" />
      <path d="M 21 14 L 26 15.5 L 21 17 Z" fill="currentColor" stroke="none" />
      {/* Bunn-linje */}
      <line x1="4" y1="22" x2="24" y2="22" />
    </svg>
  );
}

// Round Robin: fire spillere (fire prikker i kvadrant) med sirkulær
// rotasjonspil rundt midten. Viser rotation-motivet: alle bytter partner.
function RoundRobinIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Fire prikker i hjørnene — representerer de 4 spillerne */}
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="20" r="2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="20" r="2" fill="currentColor" stroke="none" />
      {/* Sirkulær pil rundt midten — rotasjons-motivet */}
      <path d="M 14 5 A 9 9 0 1 1 5 14" />
      <path d="M 5 14 L 3 11.5 M 5 14 L 7.5 11.5" />
    </svg>
  );
}

// Shamble / Champagne Scramble: champagne-glass-motiv som speiler umbrella-
// formatnavnet «Shamble / Champagne Scramble». Holder 28x28 line-icons-
// stilen med stroke=currentColor og rounded caps.
function ShambleIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Champagne-glass: cuppa */}
      <path d="M 9 4 L 19 4 L 16 13 Q 14 15 14 15 Q 14 15 12 13 Z" />
      {/* Stett */}
      <line x1="14" y1="15" x2="14" y2="22" />
      {/* Bunn */}
      <line x1="10" y1="22" x2="18" y2="22" />
      {/* Boble-prikk 1 */}
      <circle cx="13" cy="8" r="0.8" fill="currentColor" stroke="none" />
      {/* Boble-prikk 2 */}
      <circle cx="15.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Patsome: lag à 2, tre segmenter (4BBB/greensome/foursomes). To flaggstenger
// (representerer laget) med tre segmentmarkører under dem — illustrerer
// rotasjonsformatet der hvert lag spiller alle tre segmentene.
function PatsomeIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* To flaggstenger — representerer lag à 2 */}
      <line x1="9" y1="4" x2="9" y2="16" />
      <path d="M 9 5 L 15 6.5 L 9 8 Z" fill="currentColor" stroke="none" />
      <line x1="19" y1="4" x2="19" y2="16" />
      <path d="M 19 5 L 25 6.5 L 19 8 Z" fill="currentColor" stroke="none" />
      {/* Tre segmentmarkører — 4BBB / greensome / foursomes */}
      <circle cx="7" cy="22" r="2" />
      <circle cx="14" cy="22" r="2" />
      <circle cx="21" cy="22" r="2" />
    </svg>
  );
}

// Wolf: én spiller («ulven») velger partner per hull, eller går lone wolf.
// Motiv: én fylt sirkel (ulven) med en pil mot en kolonne av tre outline-
// sirkler (de tre andre å velge mellom). #274.
function WolfIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Ulven — fylt sirkel til venstre */}
      <circle cx="6" cy="14" r="3" fill="currentColor" stroke="none" />
      {/* Valg-pil mot de tre andre */}
      <line x1="10" y1="14" x2="15" y2="14" />
      <path d="M 13.5 12 L 16 14 L 13.5 16 Z" fill="currentColor" stroke="none" />
      {/* Tre å velge mellom */}
      <circle cx="21" cy="7" r="2" />
      <circle cx="24" cy="14" r="2" />
      <circle cx="21" cy="21" r="2" />
    </svg>
  );
}

// Nassau: tre veddemål per runde — front 9, back 9 og totalen. Tre pills:
// to korte øverst (de to ni-hulls-halvdelene) + én bred under (totalen). #276.
function NassauIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Front 9 + back 9 */}
      <rect x="4" y="6.5" width="8.5" height="5.5" rx="2" />
      <rect x="15.5" y="6.5" width="8.5" height="5.5" rx="2" />
      {/* Totalen */}
      <rect x="6" y="16" width="16" height="5.5" rx="2" />
    </svg>
  );
}

// Skins: hull-basert pott med carryover. Motiv: stabel av tre mynter (potten
// som vokser når hull deles). #275.
function SkinsIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Tre stablede mynter */}
      <ellipse cx="14" cy="9" rx="7" ry="2.6" />
      <path d="M 7 9 V 13" />
      <path d="M 21 9 V 13" />
      <ellipse cx="14" cy="13" rx="7" ry="2.6" />
      <path d="M 7 13 V 17" />
      <path d="M 21 13 V 17" />
      <ellipse cx="14" cy="17" rx="7" ry="2.6" />
    </svg>
  );
}

// Modified Stableford: pro-stil poeng-tabell der eagle/albatross gir tunge
// bonus-poeng. Motiv: scorekort med «+5» (eagle-bonusen) — speiler
// StablefordIcon-tekst-grepet, men signaliserer den aggressive poeng-skalaen. #281.
function ModifiedStablefordIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4.5" y="5.5" width="19" height="17" rx="2" />
      <text x="14" y="17.5" fontSize="10" fontFamily="serif" fontWeight="600" stroke="none" fill="currentColor" textAnchor="middle">+5</text>
    </svg>
  );
}

// Acey Deucey: lavest score tar potten (ace), høyest gir (deuce). Motiv: en
// opp-pil (ace, høyt) og en ned-pil (deuce, lavt) side om side. #279.
function AceyDeuceyIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Opp-pil — ace */}
      <line x1="9" y1="23" x2="9" y2="7" />
      <path d="M 5.5 10.5 L 9 6 L 12.5 10.5" />
      {/* Ned-pil — deuce */}
      <line x1="19" y1="5" x2="19" y2="21" />
      <path d="M 15.5 17.5 L 19 22 L 22.5 17.5" />
    </svg>
  );
}

// Fallback når en icon_key ikke har en dedikert komponent (nye formats før
// designet er på plass). Et nøytralt flagg-ikon signaliserer «format» uten
// å gjette på mekanikken.
function GenericFormatIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="14" y1="4" x2="14" y2="24" />
      <path d="M 14 5 L 22 7 L 14 9 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const ICON_MAP: Record<string, (props: { size?: number }) => ReactNode> = {
  stableford: StablefordIcon,
  best_ball: BestBallIcon,
  singles_matchplay: MatchplayIcon,
  solo_strokeplay: StrokeplayIcon,
  texas_scramble: TexasScrambleIcon,
  // Ambrose gjenbruker Texas scramble-ikonet — mekanikken er identisk
  // (én ball per lag, alle slår). Format-navnforskjellen synliggjøres via
  // label, ikke ikonet.
  ambrose: TexasScrambleIcon,
  // Florida Scramble gjenbruker Texas scramble-ikonet — scramble-familie,
  // kun step-aside-regelen skiller. #283.
  florida_scramble: TexasScrambleIcon,
  fourball_matchplay: FourballMatchplayIcon,
  // Foursomes, greensome, chapman og gruesome gjenbruker singles_matchplay-ikonet
  // (flagge) — alternate-shot-familien. #218 (foursomes), #289 (greensome),
  // #290 (chapman / pinehurst), #291 (gruesome).
  foursomes_matchplay: MatchplayIcon,
  greensome_matchplay: MatchplayIcon,
  chapman_matchplay: MatchplayIcon,
  gruesome_matchplay: MatchplayIcon,
  bingo_bango_bongo: BingoBangoBongoIcon,
  nines: NinesIcon,
  round_robin: RoundRobinIcon,
  shamble: ShambleIcon,
  patsome: PatsomeIcon,
  wolf: WolfIcon,
  nassau: NassauIcon,
  skins: SkinsIcon,
  modified_stableford: ModifiedStablefordIcon,
  acey_deucey: AceyDeuceyIcon,
};

export function formatIconFor(iconKey: string, size = 28): ReactNode {
  const Component = ICON_MAP[iconKey] ?? GenericFormatIcon;
  return <Component size={size} />;
}
