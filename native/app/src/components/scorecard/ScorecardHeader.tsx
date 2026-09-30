// #2262: hodet på scorekortet — spillnavnet og linja «Byneset · Gul tee (dame)
// · Stableford · banehandicap 15» fra `scorecardHeaderLine`.
//
// #2385 (designlerretet): «Mitt scorekort» står i navigatorens topp
// (`kickerHeader`), ikke en gang til over tittelen, og tittelen er den delte
// `PageTitle` i mellomstørrelsen (26 og 12 pt, som artboardet). Harde
// mellomrom inni hver del og foran hvert «·» gjør at en lang linje bare
// bryter etter et skilletegn: aldri midt i «banehandicap 15», og aldri slik at
// neste linje starter med «·».
import { PageTitle } from '../PageTitle';

export function ScorecardHeader({ title, line }: { title: string; line: string }) {
  return (
    <PageTitle
      size="medium"
      title={title}
      subtitle={
        line
          ? line
              .split(' · ')
              .map((part) => part.replace(/ /g, '\u00A0'))
              .join('\u00A0· ')
          : undefined
      }
      subtitleTestID="scorecard-header-line"
    />
  );
}
