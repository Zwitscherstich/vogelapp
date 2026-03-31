"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  beobachtungId: number;
  datum: string;
  ort: string;
  vorhandeneArten: string[];
  onGespeichert: () => void;
  onAbbrechen: () => void;
}

export default function BeobachtungBearbeiten({
  beobachtungId,
  datum: startDatum,
  ort: startOrt,
  vorhandeneArten,
  onGespeichert,
  onAbbrechen,
}: Props) {
  const [datum, setDatum] = useState(startDatum);
  const [ort, setOrt] = useState(startOrt);
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [ausgewaehlteArten, setAusgewaehlteArten] = useState<number[]>([]);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    async function laden() {
      const { data } = await supabase
        .from("vogelarten")
        .select("id, name")
        .order("name");
      if (data) {
        setVogelarten(data);
        // Vorhandene Arten vorauswählen
        const vorhandeneIds = data
          .filter((a) => vorhandeneArten.includes(a.name))
          .map((a) => a.id);
        setAusgewaehlteArten(vorhandeneIds);
      }
    }
    laden();
  }, [vorhandeneArten]);

  const gefilterteArten = vogelarten.filter((art) =>
    art.name.toLowerCase().includes(suchbegriff.toLowerCase())
  );

  function toggleArt(id: number) {
    setAusgewaehlteArten((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleSpeichern() {
    if (!datum || !ort || ausgewaehlteArten.length === 0) {
      setFehler("Bitte Datum, Ort und mindestens eine Vogelart angeben.");
      return;
    }

    setSpeichern(true);
    setFehler("");

    try {
      // Beobachtung aktualisieren
      const { error: updateError } = await supabase
        .from("beobachtungen")
        .update({ datum, ort })
        .eq("id", beobachtungId);

      if (updateError) throw updateError;

      // Alte Vogelarten-Verknüpfungen löschen
      const { error: deleteError } = await supabase
        .from("beobachtung_vogelarten")
        .delete()
        .eq("beobachtung_id", beobachtungId);

      if (deleteError) throw deleteError;

      // Neue Vogelarten-Verknüpfungen einfügen
      const artEintraege = ausgewaehlteArten.map((vogelart_id) => ({
        beobachtung_id: beobachtungId,
        vogelart_id,
      }));

      const { error: insertError } = await supabase
        .from("beobachtung_vogelarten")
        .insert(artEintraege);

      if (insertError) throw insertError;

      onGespeichert();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      setFehler("Fehler beim Speichern: " + message);
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4">
      <h3 className="font-medium text-amber-800">Beobachtung bearbeiten</h3>

      {fehler && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
          {fehler}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ort</label>
          <input
            type="text"
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
            className="border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Vogelarten</label>
        <input
          type="text"
          value={suchbegriff}
          onChange={(e) => setSuchbegriff(e.target.value)}
          placeholder="Suchen..."
          className="border border-stone-300 rounded px-3 py-2 w-full mb-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />

        {ausgewaehlteArten.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ausgewaehlteArten.map((id) => {
              const art = vogelarten.find((a) => a.id === id);
              return (
                <span
                  key={id}
                  className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-sm flex items-center gap-1"
                >
                  {art?.name}
                  <button
                    onClick={() => toggleArt(id)}
                    className="text-amber-600 hover:text-amber-800"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        <div className="border border-stone-300 rounded max-h-40 overflow-y-auto bg-white">
          {gefilterteArten.map((art) => (
            <button
              key={art.id}
              onClick={() => toggleArt(art.id)}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-stone-100 transition-colors ${
                ausgewaehlteArten.includes(art.id)
                  ? "bg-amber-50 text-amber-800 font-medium"
                  : ""
              }`}
            >
              {ausgewaehlteArten.includes(art.id) ? "✓ " : ""}
              {art.name}
            </button>
          ))}
          {gefilterteArten.length === 0 && suchbegriff.trim() && (
            <div className="px-3 py-2">
              <p className="text-sm text-stone-500 mb-1">
                Keine Vogelart gefunden.
              </p>
              <button
                onClick={async () => {
                  const name = suchbegriff.trim();
                  const { data, error } = await supabase
                    .from("vogelarten")
                    .insert({ name })
                    .select("id, name")
                    .single();
                  if (!error && data) {
                    setVogelarten((prev) =>
                      [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
                    );
                    toggleArt(data.id);
                    setSuchbegriff("");
                  }
                }}
                className="text-sm text-amber-700 font-medium hover:text-amber-900"
              >
                + &quot;{suchbegriff.trim()}&quot; als neue Vogelart hinzufügen
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSpeichern}
          disabled={speichern}
          className="bg-amber-600 text-white px-4 py-2 rounded text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {speichern ? "Speichert..." : "Änderungen speichern"}
        </button>
        <button
          onClick={onAbbrechen}
          className="bg-stone-200 text-stone-700 px-4 py-2 rounded text-sm hover:bg-stone-300 transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
