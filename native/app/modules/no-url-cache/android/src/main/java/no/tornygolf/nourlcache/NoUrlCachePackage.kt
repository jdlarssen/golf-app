// native/app/modules/no-url-cache/android/src/main/java/no/tornygolf/nourlcache/NoUrlCachePackage.kt
// #2560: Android-delen av #1973. Appen skal ikke legge igjen HTTP-svar på disk.
//
// **Hva som lå der.** Spiken 13.10 fant `cache/http-cache` med 27 svar (55
// filer) etter utlogging, 25 av dem fra staging `/rest/v1`. Det er OkHttp-
// cachen React Native legger på hver klient. Samme hull som `Cache.db` på iOS:
// én brukers data skal ikke nå den neste på samme telefon (#1404/#819).
//
// **Hvorfor fabrikken.** Hver klient som lages gjennom `OkHttpClientProvider`,
// spør `OkHttpClientProvider.factory` først: `ExpoFetchModule` (global `fetch`
// i Expo 57), React Natives `NetworkingModule`, `WebSocketModule`,
// `FrescoModule`, `DevSupportHttpClient` og `AppContext.okHttpClient`. Uten
// fabrikk legger `createClientBuilder(context)` på
// `Cache(File(cacheDir, "http-cache"), 10 MB)`. Med fabrikken under får alle
// en klient uten cache.
//
// **Hvorfor slå av, ikke tømme ved utlogging.** Samme grep som iOS: uten cache
// finnes det ingenting å tømme senere, så `wipeLocalData` trenger ingen ny
// krok, og et krasj eller en tvungen lukking midt i en økt legger heller
// ingenting igjen.
//
// **Hvorfor cookie-jaren må være med.** `createClientBuilder()` uten context
// gir `ReactCookieJarContainer`. `ExpoFetchModule` kaster `client.cookieJar`
// til `CookieJarContainer`, så en klient bygget fra en tom `OkHttpClient.Builder`
// ville krasjet ved første `fetch`.
//
// **Hvorfor `onCreate`.** `MainApplication.onCreate` kaller
// `ApplicationLifecycleDispatcher.onApplicationCreate` før noen React-instans
// lages, altså før første nettverkskall og første klient.
package no.tornygolf.nourlcache

import android.app.Application
import android.content.Context
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import java.io.File

class NoUrlCachePackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context
  ): List<ApplicationLifecycleListener> = listOf(NoUrlCacheLifecycleListener())
}

private class NoUrlCacheLifecycleListener : ApplicationLifecycleListener {
  override fun onCreate(application: Application) {
    // Rekkefølgen som på iOS: først den cachen appen ARVER fra eldre bygg
    // (motstykket til `removeAllCachedResponses()`), så fabrikken som gjør at
    // ingen ny blir laget.
    File(application.cacheDir, "http-cache").deleteRecursively()

    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder().build()
    }
  }
}
