"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import BeobachtungFormular, {
  BeobachtungDaten,
} from "@/components/BeobachtungFormular";

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
  kommentar?: string;
  onGespeichert: () => void;
  onAbbrechen: () => void;
}

export default function BeobachtungBearbeiten({
  beobachtungId,
  datum: startDatum,
  ort: startOrt,
  land: startLand,
  vorhandeneArten,
  kommentar: startKommentar = "",
  onGespeichert,
  onAbbrechen,
}: Props) {
  const [vorhandeneFotos, setVorhandeneFotos] = useState<FotoEintrag[]>([]);
  const [neueFotos, setNeueFotos] = useState<File[]>([]);
  const [speichern, setSpeichern] = useState(false);
  const [fehler, setFehler] = useState("");
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Maßgeblicher Ausgangsstand der verknüpften Arten – direkt für DIESE
  // Beobachtung geladen. Die per Prop übergebene Liste stammt aus einer
  // Sammelabfrage über alle Beobachtungen und kann unvollständig sein;
  // darauf darf beim Speichern nicht vertraut werden.
  const [basisArtIds, setBasisArtIds] = useState<number[] | null>(null);
  const [basisArtNamen, setBasisArtNamen] = useState<string[]>([]);

  const datenRef = useRef<BeobachtungDaten>({
    datum: startDatum,
    ort: startOrt,
    land: startLand,
    ausgewaehlteArten: [],
    ausgewaehlteArtenNamen: [],
    neueArtenNamen: [],
    kommentar: startKommentar,
  });

  useEffect(() => {
    async function ladeFotos() {
      const { data: fotos } = await supabase
        .from("fotos")
        .select("id, url")
        .eq("beobachtung_id", beobachtungId);
      if (fotos) setVorhandeneFotos(fotos);
    }
    ladeFotos();
  }, [beobachtungId]);

  // Verknüpfte Arten dieser einen Beobachtung laden (nach beobachtung_id
  // gefiltert, daher nie vom 1000-Zeilen-Limit betroffen).
  useEffect(() => {
    let abgebrochen = false;
    async function ladeArten() {
      const { data, error } = await supabase
        .from("beobachtung_vogelarten")
        .select("vogelart_id, vogelarten(name)")
        .eq("beobachtung_id", beobachtungId);

      if (abgebrochen) return;

      if (error || !data) {
        setFehler(
          "Vorhandene Vogelarten konnten nicht geladen werden. Bitte neu laden – Speichern ist bis dahin gesperrt."
        );
        return;
      }

      setBasisArtIds(data.map((z) => z.vogelart_id));
      setBasisArtNamen(
        data
          .map((z) => (z.vogelarten as unknown as { name: string })?.name ?? "")
          .filter(Boolean)
      );
    }
    ladeArten();
    return () => {
      abgebrochen = true;
    };
  }, [beobachtungId]);

  function handleChange(daten: BeobachtungDaten) {
    datenRef.current = daten;
  }

  async function handleSpeichern() {
    const { datum, ort, land, ausgewaehlteArten, neueArtenNamen, kommentar } =
      datenRef.current;

    if (!datum || !ort || (ausgewaehlteArten.length === 0 && neueArtenNamen.length === 0)) {
      setFehler("Bitte Datum, Ort und mindestens eine Vogelart angeben.");
      return;
    }

    // Ohne maßgeblichen Ausgangsstand darf nicht gespeichert werden – sonst
    // könnten vorhandene Arten unbemerkt entfernt werden.
    if (basisArtIds === null) {
      setFehler("Vorhandene Vogelarten noch nicht geladen. Bitte kurz warten.");
      return;
    }

    setSpeichern(true);
    setFehler("");

    try {
      // Beobachtung aktualisieren
      const { error: updateError } = await supabase
        .from("beobachtungen")
        .update({ datum, ort, land, kommentar: kommentar || null })
        .eq("id", beobachtungId);

      if (updateError) throw updateError;

      // Alle Art-IDs sammeln (inkl. neue Arten anlegen)
      const alleArtIds = [...ausgewaehlteArten];
      for (const name of neueArtenNamen) {
        const { data, error } = await supabase
          .from("vogelarten")
          .insert({ name })
          .select("id, name")
          .single();
        if (!error && data) {
          alleArtIds.push(data.id);
        }
      }

      // Nur die tatsächliche Differenz schreiben statt alles zu löschen und
      // neu anzulegen. Dadurch kann das Hinzufügen einer Art bestehende
      // Verknüpfungen nicht mehr entfernen.
      const sollIds = new Set(alleArtIds);
      const istIds = new Set(basisArtIds);

      const zuLoeschen = [...istIds].filter((id) => !sollIds.has(id));
      const zuErgaenzen = [...sollIds].filter((id) => !istIds.has(id));

      if (zuLoeschen.length > 0) {
        const { error: deleteError } = await supabase
          .from("beobachtung_vogelarten")
          .delete()
          .eq("beobachtung_id", beobachtungId)
          .in("vogelart_id", zuLoeschen);

        if (deleteError) throw deleteError;
      }

      if (zuErgaenzen.length > 0) {
        const { error: insertError } = await supabase
          .from("beobachtung_vogelarten")
          .insert(
            zuErgaenzen.map((vogelart_id) => ({
              beobachtung_id: beobachtungId,
              vogelart_id,
            }))
          );

        if (insertError) throw insertError;
      }

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

      {basisArtIds === null ? (
        <p className="text-sm text-stone-500">
          Lade vorhandene Vogelarten
          {vorhandeneArten.length > 0 && ` (${vorhandeneArten.join(", ")})`}...
        </p>
      ) : (
        <BeobachtungFormular
          initialDatum={startDatum}
          initialOrt={startOrt}
          initialLand={startLand}
          initialArten={basisArtNamen}
          initialKommentar={startKommentar}
          online={true}
          onChange={handleChange}
          farbschema="amber"
        />
      )}

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
                  onClick={() =>
                    setNeueFotos((prev) => prev.filter((_, j) => j !== i))
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
          className="text-sm bg-stone-100 text-stone-700 px-3 py-2 rounded hover:bg-stone-200 transition-colors"
        >
          📷 Fotos hinzufügen
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSpeichern}
          disabled={speichern || basisArtIds === null}
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
