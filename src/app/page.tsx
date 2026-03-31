"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function NeuePage() {
  const [datum, setDatum] = useState(() => {
    const heute = new Date();
    return heute.toISOString().split("T")[0];
  });
  const [ort, setOrt] = useState("");
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [ausgewaehlteArten, setAusgewaehlteArten] = useState<number[]>([]);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    async function ladeVogelarten() {
      const { data } = await supabase
        .from("vogelarten")
        .select("id, name")
        .order("name");
      if (data) setVogelarten(data);
    }
    ladeVogelarten();
  }, []);

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
      // Beobachtung anlegen
      const { data: beobachtung, error: beobError } = await supabase
        .from("beobachtungen")
        .insert({ datum, ort })
        .select("id")
        .single();

      if (beobError) throw beobError;

      // Vogelarten zur Beobachtung hinzufügen
      const artEintraege = ausgewaehlteArten.map((vogelart_id) => ({
        beobachtung_id: beobachtung.id,
        vogelart_id,
      }));

      const { error: artError } = await supabase
        .from("beobachtung_vogelarten")
        .insert(artEintraege);

      if (artError) throw artError;

      // Fotos hochladen
      for (const foto of fotos) {
        const dateiname = `${beobachtung.id}/${Date.now()}-${foto.name}`;
        const { error: uploadError } = await supabase.storage
          .from("fotos")
          .upload(dateiname, foto);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("fotos").getPublicUrl(dateiname);

        await supabase
          .from("fotos")
          .insert({ beobachtung_id: beobachtung.id, url: publicUrl });
      }

      setErfolg(true);
      setAusgewaehlteArten([]);
      setOrt("");
      setFotos([]);
      setSuchbegriff("");
      setTimeout(() => setErfolg(false), 3000);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unbekannter Fehler";
      setFehler("Fehler beim Speichern: " + message);
    } finally {
      setSpeichern(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Neue Beobachtung</h1>

      {erfolg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded mb-4">
          Beobachtung gespeichert!
        </div>
      )}

      {fehler && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {fehler}
        </div>
      )}

      <div className="space-y-6">
        {/* Datum */}
        <div>
          <label className="block text-sm font-medium mb-1">Datum</label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="border border-stone-300 rounded px-3 py-2 w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Ort */}
        <div>
          <label className="block text-sm font-medium mb-1">Ort</label>
          <input
            type="text"
            value={ort}
            onChange={(e) => setOrt(e.target.value)}
            placeholder="z.B. Bodensee, Ufer Ost"
            className="border border-stone-300 rounded px-3 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Vogelarten */}
        <div>
          <label className="block text-sm font-medium mb-1">Vogelarten</label>
          <input
            type="text"
            value={suchbegriff}
            onChange={(e) => setSuchbegriff(e.target.value)}
            placeholder="Suchen..."
            className="border border-stone-300 rounded px-3 py-2 w-full max-w-md mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {ausgewaehlteArten.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {ausgewaehlteArten.map((id) => {
                const art = vogelarten.find((a) => a.id === id);
                return (
                  <span
                    key={id}
                    className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-sm flex items-center gap-1"
                  >
                    {art?.name}
                    <button
                      onClick={() => toggleArt(id)}
                      className="text-emerald-600 hover:text-emerald-800"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="border border-stone-300 rounded max-h-60 overflow-y-auto">
            {gefilterteArten.map((art) => (
              <button
                key={art.id}
                onClick={() => toggleArt(art.id)}
                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-stone-100 transition-colors ${
                  ausgewaehlteArten.includes(art.id)
                    ? "bg-emerald-50 text-emerald-800 font-medium"
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
                  className="text-sm text-emerald-700 font-medium hover:text-emerald-900"
                >
                  + &quot;{suchbegriff.trim()}&quot; als neue Vogelart hinzufügen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fotos */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Fotos (optional)
          </label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                setFotos(Array.from(e.target.files));
              }
            }}
            className="text-sm"
          />
          {fotos.length > 0 && (
            <p className="text-sm text-stone-500 mt-1">
              {fotos.length} Foto(s) ausgewählt
            </p>
          )}
        </div>

        {/* Speichern */}
        <button
          onClick={handleSpeichern}
          disabled={speichern}
          className="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {speichern ? "Wird gespeichert..." : "Beobachtung speichern"}
        </button>
      </div>
    </div>
  );
}
