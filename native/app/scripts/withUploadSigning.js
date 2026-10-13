// native/app/scripts/withUploadSigning.js
// #2560: signer release-AAB-en med opplastingsnøkkelen.
//
// `/android` er gitignorert og lages på nytt ved hver prebuild, så et håndgrep i
// `android/app/build.gradle` overlever ikke. Denne config-pluginen gjør
// grepet under prebuild i stedet, og bare i butikk-varianten
// (`STORE_SIGNING_PLUGIN` i `app.config.ts`). Dev-bygget signeres med
// debug-nøkkelen som før.
//
// Tre regler:
//  1. **Ingen hemmeligheter i fila.** Sti, alias og passord leses av Gradle fra
//     miljøet ved byggetid (`TORNY_ANDROID_*`). Byggeskriptet
//     (`store-build-android.sh`) setter dem for akkurat Gradle-kjøringen.
//  2. **Aldri debug-nøkkelen som reserve.** Malens `release`-buildType har
//     `signingConfig signingConfigs.debug`; den linja byttes ut. Mangler en
//     variabel når release bygges, stopper Gradle med en melding som navngir
//     den.
//  3. **Fail-closed mot malen.** Finner funksjonen ikke ankrene den bygger på
//     (Expo har endret malen), kaster den med ankeret i meldingen. Merket
//     gjør at to kjøringer gir samme tekst.
//
// CommonJS med vilje: Expo laster lokale plugins med `require`.
/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads local config plugins via CommonJS require */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @torny-upload-signing (#2560)';

/** Miljøvariablene release-bygget leser. Byggeskriptet og runbooken bruker de samme navnene. */
const SIGNING_ENV_KEYS = ['TORNY_ANDROID_KEYSTORE', 'TORNY_ANDROID_KEY_ALIAS', 'TORNY_ANDROID_KEYSTORE_PASSWORD'];

const SIGNING_CONFIG_ANCHOR = 'signingConfigs {';
const BUILD_TYPES_ANCHOR = 'buildTypes {';
const RELEASE_ANCHOR = 'release {';
const DEBUG_SIGNING_LINE = 'signingConfig signingConfigs.debug';

function anchorError(anchor, where) {
  return new Error(
    `withUploadSigning (#2560): fant ikke «${anchor}» ${where} i android/app/build.gradle. ` +
      'Expo-malen har endret seg; les den nye malen og rett pluginen før butikkbygget kjøres.'
  );
}

/** Indeksen til krøllparentesen som lukker blokken som åpnes ved `open`. */
function closingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Innrykket på linja `index` står på. */
function indentAt(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  return /^[ \t]*/.exec(text.slice(lineStart))[0];
}

function signingConfigBlock(indent) {
  const i1 = indent;
  const i2 = indent + '    ';
  return [
    `${i1}${MARKER}: opplastingsnøkkelen, lest fra miljøet ved byggetid.`,
    `${i1}// Sti, alias og passord står aldri i denne fila (docs/native/play-store-release.md).`,
    `${i1}release {`,
    `${i2}def tornyKeystore = System.getenv('TORNY_ANDROID_KEYSTORE')`,
    `${i2}if (tornyKeystore) {`,
    `${i2}    storeFile file(tornyKeystore)`,
    `${i2}}`,
    `${i2}storePassword System.getenv('TORNY_ANDROID_KEYSTORE_PASSWORD')`,
    `${i2}keyAlias System.getenv('TORNY_ANDROID_KEY_ALIAS')`,
    `${i2}// PKCS12: nøkkelpassordet er det samme som keystore-passordet.`,
    `${i2}keyPassword System.getenv('TORNY_ANDROID_KEYSTORE_PASSWORD')`,
    `${i1}}`,
  ].join('\n');
}

// Sjekken går på oppgavegrafen og ikke i konfigurasjonen: `./gradlew clean`
// eller et debug-bygg på en butikk-prebuild skal ikke stoppe, bare et bygg
// som faktisk tar med en release-oppgave i app-prosjektet.
const FAIL_CLOSED_BLOCK = [
  '',
  `${MARKER}: release-bygget stopper når en nøkkelvariabel mangler. Aldri reserve til debug-nøkkelen.`,
  'gradle.taskGraph.whenReady { graph ->',
  "    def tornyReleaseTasks = graph.allTasks.findAll { it.project == project && it.name.toLowerCase().contains('release') }",
  '    if (!tornyReleaseTasks.isEmpty()) {',
  `        def missing = [${SIGNING_ENV_KEYS.map((key) => `'${key}'`).join(', ')}].findAll { !System.getenv(it) }`,
  '        if (!missing.isEmpty()) {',
  '            throw new GradleException("Release-bygget stoppet: ${missing.join(\', \')} mangler i miljøet. Bygg med native/app/scripts/store-build-android.sh, som setter dem.")',
  '        }',
  '    }',
  '}',
  '',
].join('\n');

/**
 * `android/app/build.gradle` med release-signering fra miljøet. Ren funksjon:
 * tekst inn, tekst ut. Kaster når et anker mangler.
 */
function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // 1. release-buildType: bytt debug-nøkkelen ut med release.
  const buildTypesStart = gradle.indexOf(BUILD_TYPES_ANCHOR);
  if (buildTypesStart === -1) throw anchorError(BUILD_TYPES_ANCHOR, 'i android {}');
  const buildTypesEnd = closingBrace(gradle, gradle.indexOf('{', buildTypesStart));
  const buildTypes = gradle.slice(buildTypesStart, buildTypesEnd + 1);

  const releaseStart = buildTypes.indexOf(RELEASE_ANCHOR);
  if (releaseStart === -1) throw anchorError(RELEASE_ANCHOR, 'i buildTypes {}');
  const releaseEnd = closingBrace(buildTypes, buildTypes.indexOf('{', releaseStart));
  const release = buildTypes.slice(releaseStart, releaseEnd + 1);
  if (!release.includes(DEBUG_SIGNING_LINE)) throw anchorError(DEBUG_SIGNING_LINE, 'i buildTypes { release {} }');

  const newRelease = release.replace(DEBUG_SIGNING_LINE, 'signingConfig signingConfigs.release');
  const newBuildTypes = buildTypes.slice(0, releaseStart) + newRelease + buildTypes.slice(releaseEnd + 1);
  let out = gradle.slice(0, buildTypesStart) + newBuildTypes + gradle.slice(buildTypesEnd + 1);

  // 2. signingConfigs: release-blokken først i blokken.
  const signingStart = out.indexOf(SIGNING_CONFIG_ANCHOR);
  if (signingStart === -1) throw anchorError(SIGNING_CONFIG_ANCHOR, 'i android {}');
  const lineEnd = out.indexOf('\n', signingStart);
  const indent = indentAt(out, signingStart) + '    ';
  out = out.slice(0, lineEnd + 1) + signingConfigBlock(indent) + '\n' + out.slice(lineEnd + 1);

  // 3. Feilgrenen sist i fila.
  return out.replace(/\n*$/, '\n') + FAIL_CLOSED_BLOCK;
}

const withUploadSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withUploadSigning (#2560): android/app/build.gradle er ${cfg.modResults.language}, ikke groovy. Pluginen kan bare Groovy-malen.`
      );
    }
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withUploadSigning;
module.exports.addReleaseSigning = addReleaseSigning;
module.exports.SIGNING_ENV_KEYS = SIGNING_ENV_KEYS;
