// native/app/scripts/withNoSdkDownload.js
// #2560: Gradle laster aldri ned SDK-pakker selv.
//
// Android Gradle-pluginen henter en NDK eller build-tools som mangler, uten å
// spørre, så lenge lisensen er godtatt. Det skjedde med build-tools 35.0.0 i
// første Android-bygg (13.10). Pluginen skriver
// `android.builder.sdkDownload=false` i `android/gradle.properties` under
// prebuild, så bygget stopper og navngir pakken som mangler i stedet. Den står
// i `app.json` og gjelder derfor både dev- og butikkbygget; byggeskriptet
// (`store-build-android.sh`) sjekker at linja er der før Gradle kjører.
//
// CommonJS med vilje: Expo laster lokale plugins med `require`.
/* eslint-disable @typescript-eslint/no-require-imports -- Expo loads local config plugins via CommonJS require */
const { withGradleProperties } = require('expo/config-plugins');

const SDK_DOWNLOAD_KEY = 'android.builder.sdkDownload';
// Uten innledende mellomrom: Expo skriver `# <verdi>` og leser tilbake med
// `trimStart`. Ren ASCII, for gradle.properties leses som ISO-8859-1.
const COMMENT = 'Gradle never downloads SDK packages on its own (#2560, scripts/withNoSdkDownload.js).';

/**
 * `gradle.properties` som liste (Expos `PropertiesItem[]`) med
 * `android.builder.sdkDownload=false` sist. En eksisterende linje for nøkkelen,
 * og kommentaren vår, fjernes først, så to kjøringer gir samme fil.
 */
function setNoSdkDownload(props) {
  const rest = props.filter(
    (item) =>
      !(item.type === 'property' && item.key === SDK_DOWNLOAD_KEY) &&
      !(item.type === 'comment' && item.value === COMMENT)
  );
  return [...rest, { type: 'comment', value: COMMENT }, { type: 'property', key: SDK_DOWNLOAD_KEY, value: 'false' }];
}

const withNoSdkDownload = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = setNoSdkDownload(cfg.modResults);
    return cfg;
  });

module.exports = withNoSdkDownload;
module.exports.setNoSdkDownload = setNoSdkDownload;
module.exports.SDK_DOWNLOAD_KEY = SDK_DOWNLOAD_KEY;
