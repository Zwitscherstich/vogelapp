"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import {
  cacheVogelarten,
  getCachedVogelarten,
  saveOfflineBeobachtung,
} from "@/lib/offlineDb";

export default function NeuePage() {
  const online = useOnlineStatus();
  const [datum, setDatum] = useState(() => {
    const heute = new Date();
    return heute.toISOString().split("T")[0];
  });
  const [ort, setOrt] = useState("");
  const [land, setLand] = useState("D");
  const [vogelarten, setVogelarten] = useState<{ id: number; name: string }[]>(
    []
  );
  const [ausgewaehlteArten, setAusgewaehlteArten] = useState<number[]>([]);
  const [neueArtenNamen, setNeueArtenNamen] = useState<string[]>([]);
  const [suchbegriff, setSuchbegriff] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState("");
  const suchfeldRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function ladeVogelarten() {
      if (online) {
        const { data } = await supabase
          .from("vogelarten")
          .select("id, name")
          .order("name");
        if (data) {
          setVogelarten(data);
          await cacheVogelarten(data);
        }
      } else {
        const cached = await getCachedVogelarten();
        setVogelarten(cached);
      }
    }
    ladeVogelarten();
  }, [online]);

  const gefilterteArten = vogelarten.filter((art) =>
    art.name.toLowerCase().includes(suchbegriff.toLowerCase())
  );

  function toggleArt(id: number) {
    setAusgewaehlteArten((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
    setSuchbegriff("");
    setTimeout(() => suchfeldRef.current?.focus(), 0);
  }

  async function handleSpeichern() {
    if (
      !datum ||
      !ort ||
      (ausgewaehlteArten.length === 0 && neueArtenNamen.length === 0)
    ) {
      setFehler("Bitte Datum, Ort und mindestens eine Vogelart angeben.");
      return;
    }

    setSpeichern(true);
    setFehler("");

    try {
      if (online) {
        // --- Online: direkt in Supabase speichern ---
        const { data: beobachtung, error: beobError } = await supabase
          .from("beobachtungen")
          .insert({ datum, ort, land })
          .select("id")
          .single();

        if (beobError) throw beobError;

        // Neue Vogelarten anlegen
        const alleArtIds = [...ausgewaehlteArten];
        for (const name of neueArtenNamen) {
          const { data: neue, error } = await supabase
            .from("vogelarten")
            .insert({ name })
            .select("id, name")
            .single();
          if (!error && neue) {
            alleArtIds.push(neue.id);
            setVogelarten((prev) =>
              [...prev, neue].sort((a, b) => a.name.localeCompare(b.name))
            );
          }
        }

        const artEintraege = alleArtIds.map((vogelart_id) => ({
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
      } else {
        // --- Offline: lokal speichern ---
        await saveOfflineBeobachtung({
          datum,
          ort,
          land,
          vogelartIds: ausgewaehlteArten,
          neueVogelarten: neueArtenNamen,
        });
      }

      setErfolg(true);
      setAusgewaehlteArten([]);
      setNeueArtenNamen([]);
      setOrt("");
      setLand("D");
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
          {online
            ? "Beobachtung gespeichert!"
            : "Beobachtung offline gespeichert – wird synchronisiert sobald du online bist."}
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

        {/* Ort & Land */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Ort</label>
            <input
              type="text"
              value={ort}
              onChange={(e) => setOrt(e.target.value)}
              placeholder="z.B. Bodensee, Ufer Ost"
              className="border border-stone-300 rounded px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium mb-1">Land</label>
            <input
              type="text"
              value={land}
              onChange={(e) => setLand(e.target.value.toUpperCase())}
              placeholder="D"
              maxLength={3}
              className="border border-stone-300 rounded px-3 py-2 w-full text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Vogelarten */}
        <div>
          <label className="block text-sm font-medium mb-1">Vogelarten</label>
          <input
            ref={suchfeldRef}
            type="text"
            value={suchbegriff}
            onChange={(e) => setSuchbegriff(e.target.value)}
            placeholder="Suchen..."
            className="border border-stone-300 rounded px-3 py-2 w-full max-w-md mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {(ausgewaehlteArten.length > 0 || neueArtenNamen.length > 0) && (
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
              {neueArtenNamen.map((name, i) => (
                <span
                  key={`new-${i}`}
                  className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm flex items-center gap-1"
                >
                  {name} (neu)
                  <button
                    onClick={() =>
                      setNeueArtenNamen((prev) =>
                        prev.filter((_, j) => j !== i)
                      )
                    }
                    className="text-blue-600 hover:text-blue-800"
                  >
                    ×
                  </button>
                </span>
              ))}
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
                    if (online) {
                      const { data, error } = await supabase
                        .from("vogelarten")
                        .insert({ name })
                        .select("id, name")
                        .single();
                      if (!error && data) {
                        setVogelarten((prev) =>
                          [...prev, data].sort((a, b) =>
                            a.name.localeCompare(b.name)
                          )
                        );
                        toggleArt(data.id);
                      }
                    } else {
                      setNeueArtenNamen((prev) => [...prev, name]);
                    }
                    setSuchbegriff("");
                    setTimeout(() => suchfeldRef.current?.focus(), 0);
                  }}
                  className="text-sm text-emerald-700 font-medium hover:text-emerald-900"
                >
                  + &quot;{suchbegriff.trim()}&quot; als neue Vogelart
                  hinzufügen
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fotos */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Fotos (optional){!online && " – nur mit Internet"}
          </label>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                setFotos((prev) => [...prev, ...Array.from(e.target.files!)]);
              }
            }}
            className="hidden"
          />
          {fotos.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {fotos.map((foto, i) => (
                <div key={i} className="relative group">
                  <img
                    src={URL.createObjectURL(foto)}
                    alt="Vorschau"
                    className="h-20 w-20 object-cover rounded border border-stone-200"
                  />
                  <button
                    onClick={() =>
                      setFotos((prev) => prev.filter((_, j) => j !== i))
                    }
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
            disabled={!online}
            className="text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            📷 Fotos auswählen
          </button>
        </div>

        {/* Speichern */}
        <button
          onClick={handleSpeichern}
          disabled={speichern}
          className="bg-emerald-600 text-white px-6 py-2 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {speichern
            ? "Wird gespeichert..."
            : online
              ? "Beobachtung speichern"
              : "Offline speichern"}
        </button>
      </div>
    </div>
  );
}
