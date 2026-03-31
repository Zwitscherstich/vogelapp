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

        <div className="flex gap-2">
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
            className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700 transition-colors"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-0">
            {vogelarten.map((art) => (
              <div
                key={art.id}
                className="px-3 py-1.5 text-sm border-b border-stone-100"
              >
                {art.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
