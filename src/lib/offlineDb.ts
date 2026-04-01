// Lokale IndexedDB für Offline-Betrieb

const DB_NAME = "vogeltagebuch";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
  vogelartIds: number[];
  // Neue Vogelart-Namen die erst noch angelegt werden müssen
  neueVogelarten: string[];
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

// --- Pending count ---
export async function getPendingCount(): Promise<number> {
  const beob = await getOfflineBeobachtungen();
  const arten = await getOfflineVogelarten();
  return beob.length + arten.length;
}
