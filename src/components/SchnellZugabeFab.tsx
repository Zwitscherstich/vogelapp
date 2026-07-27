"use client";

import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { snapshotAktualisieren } from "@/lib/schnellzugabeSnapshot";
import SchnellZugabeSheet from "./SchnellZugabeSheet";

export default function SchnellZugabeFab() {
  const online = useOnlineStatus();
  const [offen, setOffen] = useState(false);

  // Beim Einhaengen einmal vorwaermen, damit auch ohne Besuch der
  // Beobachtungs-Seite ein Snapshot existiert.
  useEffect(() => {
    if (online) void snapshotAktualisieren();
  }, [online]);

  return (
    <>
      <button
        onClick={() => setOffen(true)}
        aria-label="Vogelart schnell hinzufügen"
        className="sm:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl shadow-lg active:bg-emerald-700 flex items-center justify-center pb-[env(safe-area-inset-bottom)]"
      >
        🐦
      </button>

      {offen && <SchnellZugabeSheet onSchliessen={() => setOffen(false)} />}
    </>
  );
}
