// native/app/src/lib/webPathsStayOnWeb.test.ts
// #2748: knappene som åpner nettsiden, skal fortsatt åpne nettleseren. Får appen krav
// på en av disse stiene, går knappen tilbake til appen (Android sikkert, iPhone ikke
// prøvd), og spilleren står uten vei til siden appen ikke har. Type A.
import { APP_LINK_PATH_PREFIXES } from '../../../../lib/appLinks/appLinkPaths';
import { CREATE_ON_WEB_PATH } from './createGameCopy';
import { cupWebPath } from './endGameCopy';
import { gameWebPath } from './formatGate';
import { PRIVACY_PATH } from './webLink';

const ID = '44444444-4444-4444-8444-444444444444';

const claims = (path: string) => APP_LINK_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

describe('stiene appens egne knapper åpner', () => {
  it.each([
    ['gameWebPath', gameWebPath(ID)],
    ['spillerlista', `/games/${ID}/spillere`],
    ['cupWebPath', cupWebPath(ID)],
    ['CREATE_ON_WEB_PATH', CREATE_ON_WEB_PATH],
    ['banen', `/admin/courses/${ID}`],
    ['PRIVACY_PATH', PRIVACY_PATH],
    ['påmeldingen', `/signup/${ID}`],
    ['innloggingen', '/login'],
  ])('%s gjør appen ikke krav på', (_label, path) => {
    expect(claims(path)).toBe(false);
  });

  // Null-test: uten denne kunne `claims` blitt blind og stått grønn.
  it.each([`/runde/${ID}`, `/invitasjon/${ID}`, '/liga/bli-med/abcd2345', '/en/runde/x'])(
    'fanger en sti appen gjør krav på: %s',
    (path) => {
      expect(claims(path)).toBe(true);
    },
  );
});
