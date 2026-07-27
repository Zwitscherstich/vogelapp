"use client";

import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  snapshotAktualisieren,
  snapshotHolen,
  SNAPSHOT_MAX_ALTER_MS,
} from "@/lib/schnellzugabeSnapshot";
import SchnellZugabeSheet from "./SchnellZugabeSheet";

export default function SchnellZugabeFab() {
  const online = useOnlineStatus();
  const [offen, setOffen] = useState(false);

  // Zurueck-Taste schliesst das Sheet, statt die Seite zu verlassen.
  useEffect(() => {
    if (!offen) return;

    window.history.pushState({ schnellzugabeOffen: true }, "");

    function beiZurueck() {
      setOffen(false);
    }
    window.addEventListener("popstate", beiZurueck);

    return () => {
      window.removeEventListener("popstate", beiZurueck);
      // Wurde anders geschlossen (Fertig/Hintergrund), liegt unser Eintrag
      // noch im Verlauf und muss entfernt werden -- sonst braeuchte es zwei
      // Zurueck-Tipps, um die Seite zu verlassen.
      if (window.history.state?.schnellzugabeOffen) {
        window.history.back();
      }
    };
  }, [offen]);

  // Beim Einhaengen einmal vorwaermen, damit auch ohne Besuch der
  // Beobachtungs-Seite ein Snapshot existiert. Nur nachladen, wenn der Stand
  // wirklich veraltet ist -- sonst loeste jeder Verbindungswechsel eine
  // vollstaendige Abfrage aus, auf jeder Seite.
  useEffect(() => {
    if (!online) return;
    let abgebrochen = false;

    async function vorwaermen() {
      try {
        const vorhanden = await snapshotHolen();
        if (abgebrochen) return;
        const veraltet =
          !vorhanden ||
          Date.now() - new Date(vorhanden.erstelltAm).getTime() >
            SNAPSHOT_MAX_ALTER_MS;
        if (veraltet) void snapshotAktualisieren();
      } catch {
        // Lokale Datenbank nicht verfuegbar: das Sheet meldet es beim Oeffnen.
      }
    }

    void vorwaermen();
    return () => {
      abgebrochen = true;
    };
  }, [online]);

  return (
    <>
      <button
        onClick={() => setOffen(true)}
        aria-label="Vogelart schnell hinzufügen"
        className="sm:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl shadow-lg active:bg-emerald-700 flex items-center justify-center"
      >
        🐦
      </button>

      {offen && <SchnellZugabeSheet onSchliessen={() => setOffen(false)} />}
    </>
  );
}
