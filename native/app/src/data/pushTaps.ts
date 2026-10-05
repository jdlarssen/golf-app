// #2256 PR 4: trykk på et varsel, og varsler mens appen er åpen.
//
// **Trykk** åpner skjermen `pushTarget` peker på: spillets side for alt som
// gjelder et spill, ellers Hjem (lib/pushRoute.ts). Et trykk som startet appen
// (kaldstart) hentes med `getLastNotificationResponse`. iOS husker det siste
// trykket også når appen var åpen, så det tømmes etter HVERT trykk; ellers
// åpnes det gamle spillet igjen neste gang navigatoren monteres (ny
// innlogging). Kommer samme trykk både som kaldstart og i lytteren, åpnes det
// én gang.
//
// **Mens appen er åpen** vises ikke varselet som banner eller i varsellista:
// spilleren ser alt allerede i appen.
//
// **Lest** (#2201): lenka bærer `?varsel=<id>`, og trykket merker akkurat det
// varselet som lest, også når skjermen det åpner ikke er den webben ville
// åpnet (godkjenning og resultat åpner spillets side her).
//
// Gjør ingenting i et bygg uten den native delen, eller på Android
// (`canUsePush`).
import {
  pushNotificationId,
  pushTarget,
  pushUrl,
  type PushRequestLike,
  type PushTarget,
} from '../lib/pushRoute';
import { markNotificationRead } from './markRead';
import { canUsePush, notificationsModule } from './pushDevice';

type ResponseLike = { actionIdentifier: string; notification: { request: unknown } };

/** Start lytteren. Svarer med en funksjon som stopper den. Kaster aldri. */
export function listenForPushTaps(open: (target: PushTarget) => void): () => void {
  if (!canUsePush()) return () => {};
  try {
    const notifications = notificationsModule();
    notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    let lastHandled: string | null = null;
    const handle = (response: ResponseLike) => {
      // Bare selve trykket på varselet; andre handlinger har appen ikke.
      if (response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const request = response.notification.request as PushRequestLike & { identifier?: string };
      const id = request.identifier ?? null;
      notifications.clearLastNotificationResponse();
      if (id != null && id === lastHandled) return;
      lastHandled = id;
      const url = pushUrl(request);
      const notificationId = pushNotificationId(url);
      if (notificationId) void markNotificationRead(notificationId);
      open(pushTarget(url));
    };

    const coldStart = notifications.getLastNotificationResponse();
    if (coldStart) handle(coldStart);

    const subscription = notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  } catch (err) {
    console.error('[pushTaps] fikk ikke startet lytteren', err);
    return () => {};
  }
}
