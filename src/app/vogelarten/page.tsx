"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function VogelartenPage() {
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [neueArt, setNeueArt] = useState("");
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState("");
  const [erfolg, setErfolg] = useState("");
  const [loeschenId, setLoeschenId] = useState<number | null>(null);

  async function ladeVogelarten() {
    const { data } = await supabase
      .from("vogelarten")
      .select("id, name")
      .order("name");
    if (data) setVogelarten(data);
    setLaden(false);
  }

  useEffect(() => {
    ladeVogelarten();
  }, []);

  async function artHinzufuegen() {
    const name = neueArt.trim();
    if (!name) return;

    // Prüfen ob die Art schon existiert
    const existiert = vogelarten.some(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (existiert) {
      setFehler(`"${name}" ist bereits in der Liste.`);
      return;
    }

    const { error } = await supabase.from("vogelarten").insert({ name });

    if (error) {
      setFehler("Fehler beim Hinzufügen: " + error.message);
      return;
    }

    setNeueArt("");
    setFehler("");
    setErfolg(`"${name}" wurde hinzugefügt!`);
    setTimeout(() => setErfolg(""), 3000);
    await ladeVogelarten();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vogelarten</h1>

      {/* Neue Art hinzufügen */}
      <div className="bg-white border border-stone-200 rounded-lg p-4 shadow-sm mb-6">
        <h2 className="font-medium mb-2">Neue Vogelart hinzufügen</h2>

        {fehler && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm mb-2">
            {fehler}
          </div>
        )}
        {erfolg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded text-sm mb-2">
            {erfolg}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={neueArt}
            onChange={(e) => {
              setNeueArt(e.target.value);
              setFehler("");
            }}
            onKeyDown={(e) => e.key === "Enter" && artHinzufuegen()}
            placeholder="z.B. Seeadler"
            className="border border-stone-300 rounded px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={artHinzufuegen}
            className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            Hinzufügen
          </button>
        </div>
      </div>

      {/* Liste */}
      {laden ? (
        <p className="text-stone-500">Lade Vogelarten...</p>
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg shadow-sm">
          <div className="p-3 border-b border-stone-200 text-sm text-stone-500">
            {vogelarten.length} Vogelarten in der Liste
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0">
            {vogelarten.map((art) => (
              <div
                key={art.id}
                className="px-3 py-1.5 text-sm border-b border-stone-100 flex items-center justify-between group"
              >
                <span>{art.name}</span>
                <button
                  onClick={() => setLoeschenId(art.id)}
                  className="text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 max-sm:opacity-100 transition-opacity text-xs px-1"
                  title="Entfernen"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lösch-Bestätigung */}
      {loeschenId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Vogelart entfernen?</h3>
            <p className="text-sm text-stone-600 mb-4">
              &quot;{vogelarten.find((a) => a.id === loeschenId)?.name}&quot; wird
              aus der Liste entfernt. Bestehende Beobachtungen mit dieser Art
              bleiben erhalten.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setLoeschenId(null)}
                className="px-4 py-2 rounded text-sm bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={async () => {
                  await supabase.from("vogelarten").delete().eq("id", loeschenId);
                  setLoeschenId(null);
                  await ladeVogelarten();
                }}
                className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Ja, entfernen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
