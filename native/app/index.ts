// `crypto.getRandomValues` finnes ikke i Hermes (#1855). Expos runtime-polyfills
// dekker AbortSignal/FormData/TextDecoder/URL/fetch, men ikke WebCrypto, og
// `expo-crypto` er ikke installert. Den delte `assignRotationSlots`
// (lib/games/, #969) trekker wolf- og round-robin-rotasjonen med en
// crypto-basert Fisher–Yates — så uten denne linja KASTER «Start runden nå»
// på nøyaktig de to formatene, og GameHome fanger det som en generisk
// «Klarte ikke å oppdatere spillet».
//
// Polyfillen står FØRST, før alt annet: den setter `global.crypto`, og
// enhver modul som leser globalen ved import-tid må se den ferdig satt.
// Alternativet — å sende inn en Math.random-shuffle fra appen — ville gitt
// appen en annen trekning enn webben. Rotasjonen har ett hjem, og dette
// holder den der.
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
