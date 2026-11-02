// native/app/src/lib/cupJoinUrl.ts
// #2752: lenka arrangøren deler, som nettets `CupShareLink`. Stien har ett hjem
// (`lib/appLinks/appLinkPaths.ts`), og verten er web-adressen bygget peker på.
import { cupJoinLinkPath } from '../../../../lib/appLinks/appLinkPaths';
import { webBaseUrl } from './webLink';

/** Hele adressen, eller `null` i et bygg uten web-adresse. Da er det ingenting å dele. */
export function cupJoinUrl(shortId: string): string | null {
  const base = webBaseUrl();
  return base ? `${base}${cupJoinLinkPath(shortId)}` : null;
}
