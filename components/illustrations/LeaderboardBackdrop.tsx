/**
 * LeaderboardBackdrop — fairway-vinje for state #4 leaderboard-reveal.
 *
 * Stedsspesifikk: vises kun på den ferdigspilte runden (`State4View`), under
 * hovedinnholdet med lav opacity slik at leader-cardet og rad-listen blir
 * scenens stjerner. Skal aldri konkurrere med leader-cardet — derfor 0.07
 * opacity i light mode, 0.10 i dark (litt mer luft for å bli synlig mot
 * den varmere natt-paletten).
 *
 * SVG-avgjørelse (refs #36): vektor er valgt fremfor raster fordi
 *  - skalerer perfekt på alle viewports uten srcSet-pipeline
 *  - `currentColor` lar oss tone illustrasjonen automatisk i både lys og
 *    mørk modus (vi binder fargen til `text-accent` på wrapperen)
 *  - liten file-size (få KB inlinet) — ingen ekstra HTTP-request, ingen
 *    cache-invalidation å bekymre seg for
 *  - matcher resten av kodebasen som allerede bruker inline SVG for
 *    ikoner (se `components/icons/Icons.tsx`)
 *
 * Motivet er en rolig horisont-linje med en enslig flaggstang til høyre:
 *  - tre bølger som leser som fairway/horisont/sky, satt på ulik høyde og
 *    med svakt synkende stroke-vekt for atmosfærisk dybde
 *  - flaggstang med vimpel forankret mot høyre kanten — peker oppover som
 *    en stille hyllest til vinnerens runde
 *  - hele scenen sitter nederst i container-en (preserveAspectRatio
 *    `xMidYEnd meet`) så toppen av SVG-en aldri konkurrerer med leader-
 *    cardet, og horisonten "lander" trygt under rad-listen
 *
 * Posisjonering: caller setter `position: absolute` med `inset-0` og
 * `pointer-events-none` (se State4View). Container må være `relative` så
 * backdrop scroller med innholdet, ikke med viewporten.
 */
type Props = {
  className?: string;
};

export function LeaderboardBackdrop({ className }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden text-accent ${
        className ?? ''
      }`}
      // Light mode 0.07 / dark mode 0.10 — dark mode trenger litt mer for
      // å lese mot den varmere klubbhus-natt-paletten. Tailwind kan ikke
      // uttrykke dette med en utility uten å duplisere markup; inline
      // CSS-variabel + `dark:` modifier holder seg på én DOM-node.
      style={{ opacity: 'var(--leaderboard-backdrop-opacity, 0.07)' }}
    >
      <svg
        viewBox="0 0 400 600"
        preserveAspectRatio="xMidYEnd meet"
        className="h-full w-full"
        fill="none"
      >
        {/* Bakerste horisont — bredeste sveip, tynnest stroke. Sitter høyest
            opp og leser som et fjernt åskam. */}
        <path
          d="M -20 460 Q 80 430 200 445 T 420 430"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Midtre fairway-kant — mer markert kurve, tydeligere stroke. */}
        <path
          d="M -20 510 Q 110 478 230 498 T 420 482"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Fremste fairway-linje — nærmest betrakteren, kraftigst stroke. */}
        <path
          d="M -20 560 Q 140 528 260 548 T 420 532"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* Flaggstang — forankret mot høyre tredjedel, peker opp gjennom
            horisontene. Vimpelen krummer svakt som om den fanger en mild
            bris fra venstre. */}
        <g>
          <line
            x1="312"
            y1="362"
            x2="312"
            y2="510"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          {/* Vimpel — trekantet flagg med myk innkurve på undersiden. */}
          <path
            d="M 312 366 Q 332 372 348 378 Q 332 386 312 390 Z"
            fill="currentColor"
            opacity="0.85"
          />
          {/* Liten ball ved foten av flaggstanga — knytter scenen til golf
              uten å bli illustrativt påtrengende. */}
          <circle cx="297" cy="514" r="3" fill="currentColor" />
        </g>
      </svg>
    </div>
  );
}
