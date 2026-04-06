const KEY_LAST_SAVE = "vogeltagebuch-letzteEingabe";
const KEY_ENABLED = "vogeltagebuch-benachrichtigungen";
export const NOTIFICATION_TAG = "vogeltagebuch-wochenerinnerung";

export function setLetzteEingabe() {
  try {
    localStorage.setItem(KEY_LAST_SAVE, new Date().toISOString());
  } catch {}
}

export function getLetzteEingabe(): Date | null {
  try {
    const s = localStorage.getItem(KEY_LAST_SAVE);
    return s ? new Date(s) : null;
  } catch {
    return null;
  }
}

export function istAktiviert(): boolean {
  try {
    return localStorage.getItem(KEY_ENABLED) === "true";
  } catch {
    return false;
  }
}

export function setAktiviert(v: boolean) {
  try {
    localStorage.setItem(KEY_ENABLED, v ? "true" : "false");
  } catch {}
}

export async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Schedules a future notification 7 days from now via TimestampTrigger (Chrome).
 *  Silently skips if the API is not supported – pruefeBeimOeffnen covers that case. */
export async function scheduleWochenerinnerung() {
  if (!("serviceWorker" in navigator)) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // Cancel any previously scheduled notification with the same tag
    const bestehende = await reg.getNotifications({ tag: NOTIFICATION_TAG });
    for (const n of bestehende) n.close();

    const inSiebenTagen = Date.now() + 7 * 24 * 60 * 60 * 1000;

    // TimestampTrigger fires even when the app is closed (Chrome 80+, experimental)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ("TimestampTrigger" in (window as any)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (reg as any).showNotification("Vogeltagebuch", {
        body: "Diese Woche noch keine Beobachtung eingetragen!",
        icon: "/icon-192.svg",
        badge: "/icon-192.svg",
        tag: NOTIFICATION_TAG,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        showTrigger: new (window as any).TimestampTrigger(inSiebenTagen),
      });
    }
  } catch {
    // API not available – on-open check handles this case
  }
}

/** Shows a notification immediately if the last save was ≥ 7 days ago.
 *  Called on every app open as a fallback when TimestampTrigger is unavailable. */
export async function pruefeBeimOeffnen() {
  if (!istAktiviert()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const letzte = getLetzteEingabe();
  if (!letzte) return;

  const tage = (Date.now() - letzte.getTime()) / (1000 * 60 * 60 * 24);
  if (tage < 7) return;

  new Notification("Vogeltagebuch", {
    body: `Letzte Beobachtung vor ${Math.floor(tage)} Tagen – Zeit für einen neuen Eintrag!`,
    icon: "/icon-192.svg",
    tag: NOTIFICATION_TAG,
  });
}
