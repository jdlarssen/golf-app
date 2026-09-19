// native/app/modules/no-url-cache/ios/NoUrlCacheAppDelegateSubscriber.swift
// #1973: appen skal ikke legge igjen HTTP-svar på disk.
//
// **Hva som lå der.** Eier-tapptesten av #1942 fant 102 oppføringer i
// `Library/Caches/<bundle>/Cache.db` + `fsCachedData/`: kroppene til
// REST-svar (scores, game_players, games, users) fra brukere som for lengst
// hadde logget ut. De overlevde både utloggingen (#1877) og eier-vaktens wipe,
// fordi de to bare tømmer sqlite. #1404/#819 sier at én brukers data ikke skal
// nå den neste på samme telefon — dette var et hull i akkurat den regelen.
//
// **Hvorfor grepet må være native.** Issuet foreslo `cache: 'no-store'` på
// supabase-klientens `fetch`. Det virker ikke: Expo SDK 57 bytter ut global
// `fetch` med sin egen (`expo/src/winter/runtime.native.ts`), og hverken
// TypeScript-laget eller Swift-siden (`expo/ios/Fetch/`) leser `cache`-feltet
// — valget forsvinner stille. Faller appen tilbake på React Natives fetch,
// legger `whatwg-fetch` på `_=<tidsstempel>` i URL-en for GET med `no-store`,
// og PostgREST leser det som et filter på en kolonne som ikke finnes. Begge
// nettverkslagene henter uansett cachen fra `URLCache.shared` når økta lages,
// så det ene stedet som virkelig slår den av er her: en delt cache uten
// kapasitet, satt før noen økt finnes.
//
// **Hvorfor en lokal Expo-modul.** `native/app/ios/` er prebuild-output og
// gitignorert — en håndredigert `AppDelegate.swift` overlever ikke neste
// `expo prebuild`. Alternativet var et config-plugin som tekstpatcher malen,
// altså nettopp det `native/app/AGENTS.md` advarer mot. En lokal modul under
// `modules/` autolenkes i stedet (standard `nativeModulesDir` er `./modules`),
// uten en linje i `app.json`, og den tåler at Expo bytter ut AppDelegate-malen.
//
// Ingen JS-flate: med null kapasitet finnes det ingenting å tømme senere, så
// `wipeLocalData` trenger ingen ny krok.
import ExpoModulesCore

public class NoUrlCacheAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Rekkefølgen er hele poenget. Først tømmes den cachen appen ARVER fra
    // eldre bygg — den som ligger på disk akkurat nå. Så byttes den ut. Gjorde
    // vi det motsatt, ville vi tømt en tom cache og latt de gamle radene bli
    // liggende til noen slettet appen.
    URLCache.shared.removeAllCachedResponses()

    // `directory: nil` med null kapasitet: ingen minne-cache, ingen disk-cache.
    // Både Expos `URLSessionConfiguration.default` og React Natives egen økt
    // leser `URLCache.shared` når de lages, og begge lages først ved første
    // nettverkskall — altså etter dette.
    URLCache.shared = URLCache(memoryCapacity: 0, diskCapacity: 0, directory: nil)

    return true
  }
}
