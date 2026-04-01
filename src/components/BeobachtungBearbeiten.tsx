"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface FotoEintrag {
  id: number;
  url: string;
}

interface Props {
  beobachtungId: number;
  datum: string;
  ort: string;
  land: string;
  vorhandeneArten: string[];
  onGespeichert: () => void;
  onAbbrechen: () => void;
}

export default function BeobachtungBearbeiten({
  beobachtungId,
  datum: startDatum,
  ort: startOrt,
  land: startLand,
  vorhandeneArten,
  onGespeichert,
  onAbbrechen,
}: Props) {
  const [datum, setDatum] = useState(startDatum);
  const [ort, setOrt] = useState(startOrt);
  const [land, setLand] = useState(startLand);
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [ausgewaehlteArten, setAusgewaehlteArten] = useState<number[]>([]);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [vorhandeneFotos, setVorhandeneFotos] = useState<FotoEintrag[]>([]);
  const [neueFotos, setNeueFotos] = useState<File[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");
  const fotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function laden() {
      const { data } = await supabase
        .from("vogelarten")
        .select("id, name")
        .order("name");
      if (data) {
        setVogelarten(data);
        const vorhandeneIds = data
          .filter((a) => vorhandeneArten.includes(a.name))
          .map((a) => a.id);
        setAusgewaehlteArten(vorhandeneIds);
      }

      const { data: fotos } = await supabase
        .from("fotos")
        .select("id, url")
        .eq("beobachtung_id", beobachtungId);
      if (fotos) setVorhandeneFotos(fotos);
    }
    laden();
  }, [vorhandeneArten, beobachtungId]);

  const gefilterteArten = vogelarten.filter((art) =>
    art.name.toLowerCase().includes(suchbegriff.toLowerCase())
  );

  function toggleArt(id: number) {
    setAusgewaehlteArten((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
    setSuchbegriff("");
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
        .update({ datum, ort, land })
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

      // Neue Fotos hochladen
      for (const foto of neueFotos) {
        const dateiname = `${beobachtungId}/${Date.now()}-${foto.name}`;
        const { error: uploadError } = await supabase.storage
          .from("fotos")
          .upload(dateiname, foto);
        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("fotos").getPublicUrl(dateiname);

        await supabase
          .from("fotos")
          .insert({ beobachtung_id: beobachtungId, url: publicUrl });
      }

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
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Ort</label>
            <input
              type="text"
              value={ort}
              onChange={(e) => setOrt(e.target.value)}
              className="border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="w-20">
            <label className="block text-sm font-medium mb-1">Land</label>
            <input
              type="text"
              value={land}
              onChange={(e) => setLand(e.target.value.toUpperCase())}
              maxLength={3}
              className="border border-stone-300 rounded px-3 py-2 w-full text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
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

      {/* Fotos */}
      <div>
        <label className="block text-sm font-medium mb-1">Fotos</label>

        {vorhandeneFotos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {vorhandeneFotos.map((foto) => (
              <div key={foto.id} className="relative group">
                <img
                  src={foto.url}
                  alt="Foto"
                  className="h-20 w-20 object-cover rounded border border-stone-200"
                />
                <button
                  onClick={async () => {
                    await supabase.from("fotos").delete().eq("id", foto.id);
                    setVorhandeneFotos((prev) =>
                      prev.filter((f) => f.id !== foto.id)
                    );
                  }}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity"
                  title="Foto löschen"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fotoInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              setNeueFotos((prev) => [...prev, ...Array.from(e.target.files!)]);
            }
          }}
          className="hidden"
        />
        {neueFotos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {neueFotos.map((foto, i) => (
              <div key={i} className="relative group">
                <img
                  src={URL.createObjectURL(foto)}
                  alt="Vorschau"
                  className="h-20 w-20 object-cover rounded border border-stone-200"
                />
                <button
                  onClick={() => setNeueFotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 max-sm:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => fotoInputRef.current?.click()}
          className="text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded hover:bg-stone-200 transition-colors"
        >
          📷 Fotos hinzufügen
        </button>
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
