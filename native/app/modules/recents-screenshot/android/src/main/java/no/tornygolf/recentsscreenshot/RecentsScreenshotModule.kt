// native/app/modules/recents-screenshot/android/src/main/java/no/tornygolf/recentsscreenshot/RecentsScreenshotModule.kt
// #2841: appvelgeren på Android skal ikke vise innholdet når appen er låst.
//
// **Hva.** `Activity.setRecentsScreenshotEnabled(boolean)`, lagt til i API 33
// (Android 13). Står den på `false`, tar ikke systemet noe bilde av aktiviteten til
// appvelgeren, og viser i stedet vindusbakgrunnen i temaet. Android-dokumentasjonen
// (https://developer.android.com/reference/android/app/Activity, lest 12.11): «If set
// to false, this indicates to the system that it should never take a screenshot of the
// activity to be used as a representation in recents screen. By default, this value is
// true.» Den sier også at, i motsetning til `FLAG_SECURE`, gjelder dette bare
// appvelgeren: skjermbilder og skjermopptak virker som før. Derfor er verken
// `FLAG_SECURE` eller `expo-screen-capture` brukt (eierens valg 12.11).
//
// **Hvorfor ikke dekket i JS.** Android tar bildet når aktiviteten pauser, før
// `AppState` sier «background», så et dekk tegnet i React rekker det ikke. Dekket på
// Androids `blur` rakk det, men la seg bak hvert bunnark og hver dialog fordi en
// RN-`Modal` tar vindusfokus (målt på emulatoren).
//
// **Under API 33** finnes ikke metoden, og funksjonen gjør ingenting. Appvelgeren
// viser da innholdet, som før (`docs/native/play-store-metadata.md`).
//
// Svaret er om kallet ble gjort: `false` uten aktivitet eller under API 33.
package no.tornygolf.recentsscreenshot

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RecentsScreenshotModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecentsScreenshot")

    // `true`: systemet kan ta bildet (standard). `false`: aldri.
    Function("setEnabled") { enabled: Boolean ->
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || activity == null) {
        return@Function false
      }
      activity.runOnUiThread { activity.setRecentsScreenshotEnabled(enabled) }
      true
    }
  }
}
