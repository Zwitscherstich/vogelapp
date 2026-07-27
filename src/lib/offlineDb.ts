// Lokale IndexedDB für Offline-Betrieb

import type { Snapshot } from "./schnellzugabeChips";

const DB_NAME = "vogeltagebuch";
const DB_VERSION = 2;

/**
 * Genau eine Verbindung pro Seite, von allen Aufrufern geteilt.
 *
 * Frueher oeffnete jeder Aufruf eine eigene Verbindung und schloss sie nie.
 * Solange DB_VERSION nie stieg, fiel das nicht auf. Beim ersten
 * Versionswechsel blockierten sich diese Verbindungen jedoch gegenseitig:
 * ein Upgrade wartet, bis alle offenen Verbindungen geschlossen sind -- und
 * das geschah nie. Die Oberflaeche blieb dann dauerhaft im Ladezustand.
 */
let dbVerbindung: Promise<IDBDatabase> | null = null;

/** Wird geworfen, wenn ein anderer Kontext den Versionswechsel blockiert. */
export const DB_BLOCKIERT =
  "Die lokale Datenbank ist blockiert. Bitte alle weiteren Tabs und die " +
  "installierte App schliessen und die Seite neu laden.";

function openDb(): Promise<IDBDatabase> {
  if (dbVerbindung) return dbVerbindung;

  dbVerbindung = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let erledigt = false;

    // Ohne Zeitgrenze wartet die Oberflaeche unbegrenzt, wenn ein anderer
    // Kontext den Versionswechsel blockiert -- genau der Fehler, der die
    // Schnellzugabe dauerhaft im Ladezustand haengen liess.
    const zeitgeber = setTimeout(() => {
      if (erledigt) return;
      erledigt = true;
      dbVerbindung = null;
      reject(new Error(DB_BLOCKIERT));
    }, 5000);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("vogelarten")) {
        db.createObjectStore("vogelarten", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("offlineBeobachtungen")) {
        db.createObjectStore("offlineBeobachtungen", {
          keyPath: "tempId",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains("offlineVogelarten")) {
        db.createObjectStore("offlineVogelarten", {
          keyPath: "tempId",
          autoIncrement: true,
        });
      }
      // v2: Schnellzugabe – Snapshot und Warteschlange fuer Nachtraege
      if (!db.objectStoreNames.contains("schnellzugabeSnapshot")) {
        db.createObjectStore("schnellzugabeSnapshot", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("offlineArtNachtraege")) {
        db.createObjectStore("offlineArtNachtraege", {
          keyPath: "tempId",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      // Fordert ein anderer Kontext eine neue Version an, geben wir die
      // Verbindung frei, statt den Upgrade zu blockieren.
      db.onversionchange = () => {
        db.close();
        dbVerbindung = null;
      };
      db.onclose = () => {
        dbVerbindung = null;
      };

      if (erledigt) {
        // Zeitgrenze war schon abgelaufen: Verbindung nicht verwaisen lassen.
        db.close();
        return;
      }
      erledigt = true;
      clearTimeout(zeitgeber);
      resolve(db);
    };

    request.onerror = () => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(zeitgeber);
      dbVerbindung = null;
      reject(request.error);
    };

    request.onblocked = () => {
      if (erledigt) return;
      erledigt = true;
      clearTimeout(zeitgeber);
      dbVerbindung = null;
      reject(new Error(DB_BLOCKIERT));
    };
  });

  return dbVerbindung;
}

function doTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

// --- Vogelarten Cache ---

export async function cacheVogelarten(
  arten: { id: number; name: string }[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("vogelarten", "readwrite");
  const store = tx.objectStore("vogelarten");
  store.clear();
  for (const art of arten) {
    store.put(art);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedVogelarten(): Promise<
  { id: number; name: string }[]
> {
  return getAllFromStore("vogelarten");
}

// --- Offline Beobachtungen ---

export interface OfflineBeobachtung {
  tempId?: number;
  datum: string;
  ort: string;
  land: string;
  vogelartIds: number[];
  // Neue Vogelart-Namen die erst noch angelegt werden müssen
  neueVogelarten: string[];
  /**
   * Id der bereits auf dem Server angelegten Beobachtung. Gesetzt, sobald das
   * Anlegen geklappt hat, aber das Verknuepfen der Arten noch aussteht --
   * damit ein Wiederholungslauf die Beobachtung nicht ein zweites Mal anlegt.
   */
  serverId?: number;
}

export async function saveOfflineBeobachtung(
  beobachtung: OfflineBeobachtung
): Promise<void> {
  await doTransaction("offlineBeobachtungen", "readwrite", (store) =>
    store.add(beobachtung)
  );
}

export async function getOfflineBeobachtungen(): Promise<
  OfflineBeobachtung[]
> {
  return getAllFromStore("offlineBeobachtungen");
}

export async function deleteOfflineBeobachtung(
  tempId: number
): Promise<void> {
  await doTransaction("offlineBeobachtungen", "readwrite", (store) =>
    store.delete(tempId)
  );
}

/** Ergaenzt einen bestehenden Warteschlangen-Eintrag, ohne ihn zu ersetzen. */
export async function updateOfflineBeobachtung(
  tempId: number,
  aenderung: Partial<OfflineBeobachtung>
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("offlineBeobachtungen", "readwrite");
  const store = tx.objectStore("offlineBeobachtungen");
  const vorhanden = await new Promise<OfflineBeobachtung | undefined>((resolve, reject) => {
    const rq = store.get(tempId);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  if (!vorhanden) return;
  store.put({ ...vorhanden, ...aenderung, tempId });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Offline Vogelarten ---

export interface OfflineVogelart {
  tempId?: number;
  name: string;
}

export async function saveOfflineVogelart(name: string): Promise<void> {
  await doTransaction("offlineVogelarten", "readwrite", (store) =>
    store.add({ name })
  );
}

export async function getOfflineVogelarten(): Promise<OfflineVogelart[]> {
  return getAllFromStore("offlineVogelarten");
}

export async function deleteOfflineVogelart(tempId: number): Promise<void> {
  await doTransaction("offlineVogelarten", "readwrite", (store) =>
    store.delete(tempId)
  );
}

// --- Schnellzugabe: Snapshot ---

export async function speicherSnapshot(snapshot: Snapshot): Promise<void> {
  await doTransaction("schnellzugabeSnapshot", "readwrite", (store) =>
    store.put(snapshot)
  );
}

export async function ladeSnapshot(): Promise<Snapshot | null> {
  const treffer = await doTransaction<Snapshot | undefined>(
    "schnellzugabeSnapshot",
    "readonly",
    (store) => store.get("aktuell")
  );
  return treffer ?? null;
}

// --- Schnellzugabe: Warteschlange ---

export interface ArtNachtrag {
  tempId?: number;
  beobachtungId: number;
  /** Bestehende Art. Genau eines von vogelartId / neuerName ist gesetzt. */
  vogelartId?: number;
  /** Neue Art, die beim Sync erst angelegt werden muss. */
  neuerName?: string;
}

export async function saveArtNachtrag(nachtrag: ArtNachtrag): Promise<void> {
  await doTransaction("offlineArtNachtraege", "readwrite", (store) =>
    store.add(nachtrag)
  );
}

export async function getArtNachtraege(): Promise<ArtNachtrag[]> {
  return getAllFromStore("offlineArtNachtraege");
}

export async function deleteArtNachtrag(tempId: number): Promise<void> {
  await doTransaction("offlineArtNachtraege", "readwrite", (store) =>
    store.delete(tempId)
  );
}

/**
 * Entfernt einen noch nicht synchronisierten Nachtrag wieder aus der
 * Warteschlange. Gibt zurueck, ob etwas entfernt wurde.
 */
export async function artNachtragEntfernen(
  beobachtungId: number,
  vogelartId: number
): Promise<boolean> {
  const alle = await getArtNachtraege();
  const treffer = alle.filter(
    (n) => n.beobachtungId === beobachtungId && n.vogelartId === vogelartId
  );
  for (const n of treffer) {
    if (n.tempId !== undefined) await deleteArtNachtrag(n.tempId);
  }
  return treffer.length > 0;
}

// --- Pending count ---
export async function getPendingCount(): Promise<number> {
  const beob = await getOfflineBeobachtungen();
  const arten = await getOfflineVogelarten();
  const nachtraege = await getArtNachtraege();
  return beob.length + arten.length + nachtraege.length;
}
