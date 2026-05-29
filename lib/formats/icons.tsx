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
  fourball_matchplay: FourballMatchplayIcon,
  bingo_bango_bongo: BingoBangoBongoIcon,
};

export function formatIconFor(iconKey: string, size = 28): ReactNode {
  const Component = ICON_MAP[iconKey] ?? GenericFormatIcon;
  return <Component size={size} />;
}
