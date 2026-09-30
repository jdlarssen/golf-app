// #2262: hodet på scorekortet — spillnavnet og linja «Byneset · Gul tee (dame)
// · Stableford · banehandicap 15» fra `scorecardHeaderLine`.
//
// #2385 (designlerretet): «Mitt scorekort» står i navigatorens topp
// (`kickerHeader`), ikke en gang til over tittelen, og tittelen er den delte
// `PageTitle`. Et hardt mellomrom foran hvert «·» gjør at en lang linje aldri
// bryter slik at neste linje starter med skilletegnet.
import { PageTitle } from '../PageTitle';

export function ScorecardHeader({ title, line }: { title: string; line: string }) {
  return (
    <PageTitle
      title={title}
      subtitle={line ? line.split(' · ').join('\u00A0· ') : undefined}
      subtitleTestID="scorecard-header-line"
    />
  );
}
