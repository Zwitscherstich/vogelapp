"use client";

import { useState, useEffect, useCallback } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { getPendingCount } from "@/lib/offlineDb";
import { syncOfflineData } from "@/lib/sync";

export default function SyncStatus() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [nachricht, setNachricht] = useState("");

  const checkPending = useCallback(async () => {
    const count = await getPendingCount();
    setPending(count);
  }, []);

  // Regelmäßig prüfen ob offline-Einträge vorhanden sind
  useEffect(() => {
    checkPending();
    const interval = setInterval(checkPending, 3000);
    return () => clearInterval(interval);
  }, [checkPending]);

  // Automatisch synchronisieren wenn online und Einträge vorhanden
  useEffect(() => {
    if (online && pending > 0 && !syncing) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, pending]);

  async function handleSync() {
    setSyncing(true);
    try {
      const synced = await syncOfflineData();
      if (synced > 0) {
        setNachricht(`${synced} Eintrag/Einträge synchronisiert!`);
        setTimeout(() => setNachricht(""), 3000);
      }
      await checkPending();
    } finally {
      setSyncing(false);
    }
  }

  // Nichts anzeigen wenn online und keine Einträge und keine Nachricht
  if (online && pending === 0 && !nachricht) return null;

  return (
    <div className="max-w-4xl mx-auto px-4">
      {!online && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2 mb-2">
          <span className="inline-block w-2 h-2 bg-amber-500 rounded-full" />
          Offline – Einträge werden lokal gespeichert
          {pending > 0 && (
            <span className="ml-auto text-amber-600">
              {pending} warten auf Sync
            </span>
          )}
        </div>
      )}
      {online && pending > 0 && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2 mb-2">
          {syncing ? (
            <>Synchronisiere {pending} Eintrag/Einträge...</>
          ) : (
            <>
              {pending} Eintrag/Einträge warten auf Synchronisation
              <button
                onClick={handleSync}
                className="ml-auto text-blue-700 font-medium hover:text-blue-900"
              >
                Jetzt synchronisieren
              </button>
            </>
          )}
        </div>
      )}
      {nachricht && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-lg text-sm mb-2">
          {nachricht}
        </div>
      )}
    </div>
  );
}
