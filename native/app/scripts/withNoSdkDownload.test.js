// native/app/scripts/withNoSdkDownload.test.js
// #2560: Gradle skal aldri laste ned SDK-pakker uten å spørre, verken i
// dev-bygget eller i butikkbygget. Android Gradle-pluginen henter en manglende
// NDK eller build-tools så lenge lisensen er godtatt (build-tools 35.0.0 kom
// slik 13.10). `android.builder.sdkDownload=false` i `gradle.properties` slår
// det av; da stopper bygget og sier hvilken pakke som mangler.
import { AndroidConfig } from 'expo/config-plugins';
import { SDK_DOWNLOAD_KEY, setNoSdkDownload } from './withNoSdkDownload';

const { parsePropertiesFile, propertiesListToString } = AndroidConfig.Properties;

// Utdrag av Expo-malens android/gradle.properties (expo 57.0.18).
const TEMPLATE = [
  '# Project-wide Gradle settings.',
  'org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m',
  'org.gradle.parallel=true',
  '',
  'android.useAndroidX=true',
  'reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64',
  'hermesEnabled=true',
].join('\n');

const valuesOf = (props) => props.filter((p) => p.type === 'property' && p.key === SDK_DOWNLOAD_KEY).map((p) => p.value);

describe('setNoSdkDownload', () => {
  it('slår av SDK-nedlasting i malen', () => {
    const out = setNoSdkDownload(parsePropertiesFile(TEMPLATE));
    expect(SDK_DOWNLOAD_KEY).toBe('android.builder.sdkDownload');
    expect(valuesOf(out)).toEqual(['false']);
  });

  it('lar resten av gradle.properties stå', () => {
    const before = parsePropertiesFile(TEMPLATE);
    const out = setNoSdkDownload(before);
    expect(out.slice(0, before.length)).toEqual(before);
  });

  it('erstatter en verdi som slår nedlasting på, og lar bare én linje stå', () => {
    const out = setNoSdkDownload(parsePropertiesFile(`${TEMPLATE}\n${SDK_DOWNLOAD_KEY}=true`));
    expect(valuesOf(out)).toEqual(['false']);
  });

  it('gir samme fil ved to kjøringer', () => {
    const once = propertiesListToString(setNoSdkDownload(parsePropertiesFile(TEMPLATE)));
    const twice = propertiesListToString(setNoSdkDownload(parsePropertiesFile(once)));
    expect(twice).toBe(once);
  });
});
