// native/app/scripts/withUploadSigning.test.js
// #2560: signeringen av release-AAB-en med opplastingsnøkkelen.
//
// `/android` er gitignorert og lages på nytt ved hver prebuild, så signeringen
// legges inn av en config-plugin. Kjernen er en ren tekstfunksjon over
// `android/app/build.gradle`, testet mot en ekte fil fra prebuild (fiksturen
// er merket med kilde og Expo-versjon). Fire ting må stå:
//
//  1. `release`-buildType bruker en egen `release`-signingConfig, og malens
//     `signingConfig signingConfigs.debug` står ikke igjen som reserve.
//  2. Ingen sti, alias eller passord skrives inn i fila. Alt leses fra
//     miljøet ved byggetid.
//  3. Mangler en `TORNY_ANDROID_*`-variabel når release bygges, stopper
//     Gradle med en melding som navngir den.
//  4. Ankeret mangler (Expo har endret malen) → kast. To kjøringer gir samme
//     tekst.
import { readFileSync } from 'fs';
import { join } from 'path';
import { addReleaseSigning, closingBrace, SIGNING_ENV_KEYS } from './withUploadSigning';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'app-build.gradle'), 'utf8');

/** Blokken som starter med `header`, til krøllparentesen som lukker den (pluginens egen teller). */
function block(gradle, header) {
  const start = gradle.indexOf(header);
  if (start === -1) return null;
  return gradle.slice(start, closingBrace(gradle, gradle.indexOf('{', start)) + 1);
}

describe('addReleaseSigning', () => {
  const out = addReleaseSigning(FIXTURE);

  it('legger til en release-signingConfig', () => {
    const signingConfigs = block(out, 'signingConfigs {');
    expect(signingConfigs).toContain('release {');
  });

  it('kobler release-buildType til release-signingConfig, ikke debug', () => {
    const buildTypes = block(out, 'buildTypes {');
    const release = block(buildTypes, 'release {');
    expect(release).toContain('signingConfig signingConfigs.release');
    expect(release).not.toContain('signingConfigs.debug');
  });

  it('lar debug stå urørt: debug-nøkkelen og debug-buildType', () => {
    expect(block(block(out, 'signingConfigs {'), 'debug {')).toBe(
      block(block(FIXTURE, 'signingConfigs {'), 'debug {')
    );
    expect(block(block(out, 'buildTypes {'), 'debug {')).toBe(block(block(FIXTURE, 'buildTypes {'), 'debug {'));
  });

  it('leser sti, alias og passord fra miljøet, og skriver ingen verdier inn', () => {
    const release = block(block(out, 'signingConfigs {'), 'release {');
    for (const key of SIGNING_ENV_KEYS) {
      expect(release).toContain(`System.getenv('${key}')`);
    }
    expect(release).not.toMatch(/storePassword\s+['"]/);
    expect(release).not.toMatch(/keyPassword\s+['"]/);
    expect(release).not.toMatch(/keyAlias\s+['"]/);
  });

  it('genererer signeringsblokken og feilgrenen slik snapshotet låser dem', () => {
    expect(block(block(out, 'signingConfigs {'), 'release {')).toMatchSnapshot();
    expect(out.slice(out.indexOf('gradle.taskGraph.whenReady'))).toMatchSnapshot();
  });

  // Groovy kan ikke kjøres her. Strukturen sier hva Gradle gjør: kastet er det
  // eneste i grenen for manglende variabler, som bare nås når oppgavegrafen har
  // en release-oppgave i app-prosjektet. At kastet faktisk stopper bygget, er
  // målt med `./gradlew :app:bundleRelease -m` uten variablene (#2560).
  it('stopper bygget bare når en release-oppgave er med og en variabel mangler', () => {
    const guard = block(out, 'gradle.taskGraph.whenReady');
    const releaseBranch = block(guard, 'if (!tornyReleaseTasks.isEmpty())');
    const missingBranch = block(releaseBranch, 'if (!missing.isEmpty())');
    expect(guard).toMatch(
      /def tornyReleaseTasks = graph\.allTasks\.findAll \{ it\.project == project && it\.name\.toLowerCase\(\)\.contains\('release'\) \}/
    );
    const listed = /def missing = \[(.*)\]\.findAll \{ !System\.getenv\(it\) \}/.exec(releaseBranch)[1];
    expect(listed.split(',').map((key) => key.trim().replace(/'/g, ''))).toEqual(SIGNING_ENV_KEYS);
    expect(missingBranch).toMatch(
      /^if \(!missing\.isEmpty\(\)\) \{\s*throw new GradleException\("[^"]*\$\{missing\.join\(', '\)\}[^"]*"\)\s*\}$/
    );
  });

  it('navngir de tre miljøvariablene byggeskriptet setter', () => {
    expect(SIGNING_ENV_KEYS).toEqual([
      'TORNY_ANDROID_KEYSTORE',
      'TORNY_ANDROID_KEY_ALIAS',
      'TORNY_ANDROID_KEYSTORE_PASSWORD',
    ]);
  });

  it('gir samme tekst ved to kjøringer', () => {
    expect(addReleaseSigning(out)).toBe(out);
  });

  it('kaster og navngir ankeret når signingConfigs-blokken mangler', () => {
    const broken = FIXTURE.replace('signingConfigs {', 'signingKonfig {');
    expect(() => addReleaseSigning(broken)).toThrow(/signingConfigs \{/);
  });

  it('kaster og navngir ankeret når release-buildType ikke peker på debug-nøkkelen', () => {
    const buildTypes = block(FIXTURE, 'buildTypes {');
    const broken = FIXTURE.replace(buildTypes, buildTypes.replace(/(release \{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1'));
    expect(() => addReleaseSigning(broken)).toThrow(/signingConfig signingConfigs\.debug/);
  });

  it('kaster når buildTypes mangler en release-blokk', () => {
    const buildTypes = block(FIXTURE, 'buildTypes {');
    const broken = FIXTURE.replace(buildTypes, block(FIXTURE, 'buildTypes {').replace('release {', 'staging {'));
    expect(() => addReleaseSigning(broken)).toThrow(/release \{/);
  });
});
