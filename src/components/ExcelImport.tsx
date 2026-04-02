"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

interface Props {
  onImportiert: () => void;
}

interface ParsedZeile {
  zeilenNr: number;
  datum: string;
  ort: string;
  land: string;
  vogelarten: string[];
}

interface ValidationFehler {
  zeilenNr: number;
  nachricht: string;
  typ: "datum" | "ort" | "vogelarten" | "format";
}

interface DuplikatWarnung {
  zeilenNr: number;
  nachricht: string;
}

type ImportStatus =
  | "idle"
  | "vorschau"
  | "importiert"
  | "fehler";

export default function ExcelImport({ onImportiert }: Props) {
  const [offen, setOffen] = useState(false);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [gueltigeZeilen, setGueltigeZeilen] = useState<ParsedZeile[]>([]);
  const [fehler, setFehler] = useState<ValidationFehler[]>([]);
  const [warnungen, setWarnungen] = useState<DuplikatWarnung[]>([]);
  const [gesamtZeilen, setGesamtZeilen] = useState(0);
  const [fehlerAusgeklappt, setFehlerAusgeklappt] = useState(false);
  const [importFortschritt, setImportFortschritt] = useState(0);
  const [importGesamt, setImportGesamt] = useState(0);
  const [importErgebnis, setImportErgebnis] = useState<{
    erfolgreich: number;
    fehlgeschlagen: number;
    fehlerDetails: string[];
  } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseDatum(wert: unknown): string | null {
    if (wert === null || wert === undefined || wert === "") return null;

    // Excel serial date number
    if (typeof wert === "number") {
      try {
        const dateParts = XLSX.SSF.parse_date_code(wert);
        if (dateParts) {
          const y = dateParts.y;
          const m = String(dateParts.m).padStart(2, "0");
          const d = String(dateParts.d).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
      } catch {
        return null;
      }
    }

    const str = String(wert).trim();

    // YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      const datum = new Date(Number(y), Number(m) - 1, Number(d));
      if (
        datum.getFullYear() === Number(y) &&
        datum.getMonth() === Number(m) - 1 &&
        datum.getDate() === Number(d)
      ) {
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return null;
    }

    // DD.MM.YYYY
    const deMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (deMatch) {
      const [, d, m, y] = deMatch;
      const datum = new Date(Number(y), Number(m) - 1, Number(d));
      if (
        datum.getFullYear() === Number(y) &&
        datum.getMonth() === Number(m) - 1 &&
        datum.getDate() === Number(d)
      ) {
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
      return null;
    }

    return null;
  }

  function handleDateiAuswahl(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (!datei) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        if (jsonData.length === 0) {
          setFehler([
            {
              zeilenNr: 0,
              nachricht: "Die Datei enthält keine Daten.",
              typ: "format",
            },
          ]);
          setGueltigeZeilen([]);
          setGesamtZeilen(0);
          setWarnungen([]);
          setStatus("vorschau");
          return;
        }

        const neueFehler: ValidationFehler[] = [];
        const neueGueltige: ParsedZeile[] = [];
        const duplikatPruefung = new Map<string, number[]>();

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const zeilenNr = i + 2; // +2: 1 for header, 1 for 0-index
          let istGueltig = true;

          // Datum
          const rawDatum = row["Datum"] ?? row["datum"] ?? "";
          const datum = parseDatum(rawDatum);
          if (!rawDatum && rawDatum !== 0) {
            neueFehler.push({
              zeilenNr,
              nachricht: "Datum fehlt",
              typ: "datum",
            });
            istGueltig = false;
          } else if (!datum) {
            neueFehler.push({
              zeilenNr,
              nachricht: `Ungültiges Datumsformat '${String(rawDatum)}'`,
              typ: "datum",
            });
            istGueltig = false;
          }

          // Ort
          const ort = String(row["Ort"] ?? row["ort"] ?? "").trim();
          if (!ort) {
            neueFehler.push({
              zeilenNr,
              nachricht: "Ort fehlt",
              typ: "ort",
            });
            istGueltig = false;
          }

          // Land
          const rawLand = String(row["Land"] ?? row["land"] ?? "D").trim();
          const land = rawLand.substring(0, 3).toUpperCase() || "D";

          // Vogelarten
          const rawArten = String(
            row["Vogelarten"] ?? row["vogelarten"] ?? ""
          ).trim();
          if (!rawArten) {
            neueFehler.push({
              zeilenNr,
              nachricht: "Vogelarten fehlt",
              typ: "vogelarten",
            });
            istGueltig = false;
          }

          const vogelarten = rawArten
            ? rawArten
                .split(",")
                .map((a) => a.trim())
                .filter((a) => a.length > 0)
            : [];

          if (rawArten && vogelarten.length === 0) {
            neueFehler.push({
              zeilenNr,
              nachricht: "Keine gültigen Vogelarten gefunden",
              typ: "vogelarten",
            });
            istGueltig = false;
          }

          if (istGueltig && datum) {
            neueGueltige.push({
              zeilenNr,
              datum,
              ort,
              land,
              vogelarten,
            });

            // Duplikat-Prüfung
            const schluessel = `${datum}|${ort.toLowerCase()}`;
            const vorhandene = duplikatPruefung.get(schluessel) ?? [];
            vorhandene.push(zeilenNr);
            duplikatPruefung.set(schluessel, vorhandene);
          }
        }

        // Duplikat-Warnungen erzeugen
        const neueWarnungen: DuplikatWarnung[] = [];
        for (const [schluessel, zeilen] of duplikatPruefung) {
          if (zeilen.length > 1) {
            const [datum, ort] = schluessel.split("|");
            for (const z of zeilen) {
              neueWarnungen.push({
                zeilenNr: z,
                nachricht: `Doppelter Eintrag: ${datum} / ${ort} (Zeilen ${zeilen.join(", ")})`,
              });
            }
          }
        }

        setGesamtZeilen(jsonData.length);
        setGueltigeZeilen(neueGueltige);
        setFehler(neueFehler);
        setWarnungen(neueWarnungen);
        setStatus("vorschau");
        setFehlerAusgeklappt(false);
        setImportErgebnis(null);
      } catch {
        setFehler([
          {
            zeilenNr: 0,
            nachricht:
              "Die Datei konnte nicht gelesen werden. Bitte überprüfe das Format.",
            typ: "format",
          },
        ]);
        setGueltigeZeilen([]);
        setGesamtZeilen(0);
        setWarnungen([]);
        setStatus("vorschau");
      }
    };
    reader.readAsArrayBuffer(datei);

    // Reset file input so re-selecting the same file triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleImport() {
    if (gueltigeZeilen.length === 0) return;

    setLaeuft(true);
    setImportGesamt(gueltigeZeilen.length);
    setImportFortschritt(0);

    let erfolgreich = 0;
    const fehlerDetails: string[] = [];

    // Cache für Vogelarten-IDs, um wiederholte Abfragen zu vermeiden
    const vogelartCache = new Map<string, number>();

    // Vorhandene Vogelarten laden
    const { data: vorhandeneArten } = await supabase
      .from("vogelarten")
      .select("id, name");
    if (vorhandeneArten) {
      for (const art of vorhandeneArten) {
        vogelartCache.set(art.name.toLowerCase(), art.id);
      }
    }

    for (let i = 0; i < gueltigeZeilen.length; i++) {
      const zeile = gueltigeZeilen[i];
      setImportFortschritt(i + 1);

      try {
        // Beobachtung einfügen
        const { data: beobachtung, error: beobError } = await supabase
          .from("beobachtungen")
          .insert({
            datum: zeile.datum,
            ort: zeile.ort,
            land: zeile.land,
          })
          .select("id")
          .single();

        if (beobError || !beobachtung) {
          throw new Error(beobError?.message ?? "Beobachtung konnte nicht erstellt werden");
        }

        // Vogelarten verarbeiten
        const artIds: number[] = [];
        for (const artName of zeile.vogelarten) {
          const cacheKey = artName.toLowerCase();
          let artId: number | undefined = vogelartCache.get(cacheKey);

          if (artId === undefined) {
            // Erst suchen ob die Art schon existiert
            const { data: existing } = await supabase
              .from("vogelarten")
              .select("id")
              .ilike("name", artName)
              .single();

            if (existing) {
              artId = existing.id;
            } else {
              // Vogelart anlegen
              const { data: neueArt, error: artError } = await supabase
                .from("vogelarten")
                .insert({ name: artName })
                .select("id")
                .single();

              if (artError || !neueArt) {
                // Race condition - nochmal suchen
                const { data: gefunden } = await supabase
                  .from("vogelarten")
                  .select("id")
                  .ilike("name", artName)
                  .single();

                if (gefunden) {
                  artId = gefunden.id;
                } else {
                  throw new Error(
                    `Vogelart '${artName}' konnte nicht erstellt werden: ${artError?.message ?? "Unbekannt"}`
                  );
                }
              } else {
                artId = neueArt.id;
              }
            }

            vogelartCache.set(cacheKey, artId!);
          }

          artIds.push(artId!);
        }

        // Verknüpfungen einfügen
        if (artIds.length > 0) {
          const verknuepfungen = artIds.map((vogelart_id) => ({
            beobachtung_id: beobachtung.id,
            vogelart_id,
          }));

          const { error: linkError } = await supabase
            .from("beobachtung_vogelarten")
            .insert(verknuepfungen);

          if (linkError) {
            throw new Error(
              `Vogelarten-Verknüpfung fehlgeschlagen: ${linkError.message}`
            );
          }
        }

        erfolgreich++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler";
        fehlerDetails.push(`Zeile ${zeile.zeilenNr}: ${message}`);
      }
    }

    setImportErgebnis({
      erfolgreich,
      fehlgeschlagen: gueltigeZeilen.length - erfolgreich,
      fehlerDetails,
    });
    setStatus("importiert");
    setLaeuft(false);

    if (erfolgreich > 0) {
      onImportiert();
    }
  }

  function handleZuruecksetzen() {
    setStatus("idle");
    setGueltigeZeilen([]);
    setFehler([]);
    setWarnungen([]);
    setGesamtZeilen(0);
    setImportErgebnis(null);
    setImportFortschritt(0);
    setImportGesamt(0);
    setFehlerAusgeklappt(false);
  }

  // Fehler nach Typ gruppieren
  function gruppierteFehler() {
    const gruppen: Record<string, ValidationFehler[]> = {};
    for (const f of fehler) {
      const label =
        f.typ === "datum"
          ? "Datum-Fehler"
          : f.typ === "ort"
            ? "Ort-Fehler"
            : f.typ === "vogelarten"
              ? "Vogelarten-Fehler"
              : "Format-Fehler";
      if (!gruppen[label]) gruppen[label] = [];
      gruppen[label].push(f);
    }
    return Object.entries(gruppen);
  }

  const MAX_ANGEZEIGTE_FEHLER = 10;

  return (
    <div className="border border-stone-200 rounded-lg bg-white shadow-sm">
      <button
        onClick={() => setOffen(!offen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-stone-50 transition-colors rounded-lg"
      >
        <span className="font-medium text-stone-700">
          {"📥"} Excel-Import
        </span>
        <span className="text-stone-400 text-sm">
          {offen ? "▲" : "▼"}
        </span>
      </button>

      {offen && (
        <div className="px-4 pb-4 space-y-4 border-t border-stone-100">
          {/* Info-Box */}
          <div className="mt-4 bg-stone-50 border border-stone-200 rounded p-3">
            <p className="text-sm text-stone-600 mb-2">
              Importiere Beobachtungen aus einer Excel- oder CSV-Datei. Die Datei
              muss folgende Spalten enthalten:
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs border border-stone-300 rounded w-full">
                <thead>
                  <tr className="bg-stone-200">
                    <th className="px-2 py-1 text-left border-r border-stone-300">
                      Datum
                    </th>
                    <th className="px-2 py-1 text-left border-r border-stone-300">
                      Ort
                    </th>
                    <th className="px-2 py-1 text-left border-r border-stone-300">
                      Land
                    </th>
                    <th className="px-2 py-1 text-left">Vogelarten</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      2025-03-15
                    </td>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      Stadtpark
                    </td>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      D
                    </td>
                    <td className="px-2 py-1 border-t border-stone-300">
                      Amsel, Kohlmeise, Rotkehlchen
                    </td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      15.03.2025
                    </td>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      Bodensee
                    </td>
                    <td className="px-2 py-1 border-r border-t border-stone-300">
                      D
                    </td>
                    <td className="px-2 py-1 border-t border-stone-300">
                      Haubentaucher, Stockente
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-500 mt-2">
              <strong>Datum</strong> (Pflicht): YYYY-MM-DD oder DD.MM.YYYY
              {" | "}
              <strong>Ort</strong> (Pflicht): Freitext
              {" | "}
              <strong>Land</strong> (optional, Standard: D)
              {" | "}
              <strong>Vogelarten</strong> (Pflicht): kommagetrennt
            </p>
          </div>

          {/* Datei-Auswahl */}
          {(status === "idle" || status === "importiert") && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleDateiAuswahl}
                className="block w-full text-sm text-stone-600
                  file:mr-3 file:py-2 file:px-4
                  file:rounded file:border-0
                  file:text-sm file:font-medium
                  file:bg-emerald-50 file:text-emerald-700
                  hover:file:bg-emerald-100
                  file:cursor-pointer file:transition-colors"
              />
            </div>
          )}

          {/* Import-Ergebnis */}
          {status === "importiert" && importErgebnis && (
            <div className="space-y-3">
              {importErgebnis.erfolgreich > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                  <p className="text-sm font-medium text-emerald-800">
                    {importErgebnis.erfolgreich}{" "}
                    {importErgebnis.erfolgreich === 1
                      ? "Beobachtung"
                      : "Beobachtungen"}{" "}
                    erfolgreich importiert.
                  </p>
                </div>
              )}
              {importErgebnis.fehlgeschlagen > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm font-medium text-red-800">
                    {importErgebnis.fehlgeschlagen}{" "}
                    {importErgebnis.fehlgeschlagen === 1
                      ? "Beobachtung"
                      : "Beobachtungen"}{" "}
                    fehlgeschlagen.
                  </p>
                  <ul className="mt-2 space-y-1">
                    {importErgebnis.fehlerDetails.map((detail, i) => (
                      <li key={i} className="text-xs text-red-700">
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={handleZuruecksetzen}
                className="text-sm bg-stone-200 text-stone-700 px-4 py-2 rounded hover:bg-stone-300 transition-colors"
              >
                Neuer Import
              </button>
            </div>
          )}

          {/* Fortschrittsanzeige */}
          {laeuft && (
            <div className="space-y-2">
              <p className="text-sm text-stone-600">
                Importiere... ({importFortschritt} / {importGesamt})
              </p>
              <div className="w-full bg-stone-200 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${importGesamt > 0 ? (importFortschritt / importGesamt) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Vorschau */}
          {status === "vorschau" && !laeuft && (
            <div className="space-y-3">
              {/* Zusammenfassung */}
              <div className="bg-stone-50 border border-stone-200 rounded p-3">
                <p className="text-sm text-stone-700">
                  <strong>{gesamtZeilen}</strong>{" "}
                  {gesamtZeilen === 1 ? "Zeile" : "Zeilen"} gefunden,{" "}
                  <span className="text-emerald-700 font-medium">
                    {gueltigeZeilen.length} gültig
                  </span>
                  {fehler.length > 0 && (
                    <>
                      ,{" "}
                      <span className="text-red-700 font-medium">
                        {fehler.length}{" "}
                        {fehler.length === 1 ? "Fehler" : "Fehler"}
                      </span>
                    </>
                  )}
                  {warnungen.length > 0 && (
                    <>
                      ,{" "}
                      <span className="text-amber-700 font-medium">
                        {warnungen.length}{" "}
                        {warnungen.length === 1 ? "Warnung" : "Warnungen"}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Warnungen */}
              {warnungen.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    Warnungen (Import trotzdem möglich):
                  </p>
                  <ul className="space-y-0.5">
                    {warnungen
                      .slice(
                        0,
                        fehlerAusgeklappt
                          ? warnungen.length
                          : MAX_ANGEZEIGTE_FEHLER
                      )
                      .map((w, i) => (
                        <li key={i} className="text-xs text-amber-700">
                          Zeile {w.zeilenNr}: {w.nachricht}
                        </li>
                      ))}
                  </ul>
                  {warnungen.length > MAX_ANGEZEIGTE_FEHLER &&
                    !fehlerAusgeklappt && (
                      <button
                        onClick={() => setFehlerAusgeklappt(true)}
                        className="text-xs text-amber-600 mt-1 hover:text-amber-800 underline"
                      >
                        Alle {warnungen.length} Warnungen anzeigen
                      </button>
                    )}
                </div>
              )}

              {/* Fehler */}
              {fehler.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm font-medium text-red-800 mb-2">
                    Fehler (diese Zeilen werden nicht importiert):
                  </p>
                  {gruppierteFehler().map(([typ, fehlerListe]) => {
                    const angezeigteFehler = fehlerAusgeklappt
                      ? fehlerListe
                      : fehlerListe.slice(0, MAX_ANGEZEIGTE_FEHLER);
                    return (
                      <div key={typ} className="mb-2">
                        <p className="text-xs font-medium text-red-700 mb-0.5">
                          {typ} ({fehlerListe.length}):
                        </p>
                        <ul className="space-y-0.5">
                          {angezeigteFehler.map((f, i) => (
                            <li key={i} className="text-xs text-red-600">
                              Zeile {f.zeilenNr}: {f.nachricht}
                            </li>
                          ))}
                        </ul>
                        {fehlerListe.length > MAX_ANGEZEIGTE_FEHLER &&
                          !fehlerAusgeklappt && (
                            <button
                              onClick={() => setFehlerAusgeklappt(true)}
                              className="text-xs text-red-500 mt-1 hover:text-red-700 underline"
                            >
                              Alle {fehlerListe.length} Fehler anzeigen
                            </button>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Aktionen */}
              <div className="flex gap-2">
                {gueltigeZeilen.length > 0 && (
                  <button
                    onClick={handleImport}
                    className="bg-emerald-600 text-white px-4 py-2 rounded text-sm hover:bg-emerald-700 transition-colors"
                  >
                    {gueltigeZeilen.length}{" "}
                    {gueltigeZeilen.length === 1
                      ? "Beobachtung"
                      : "Beobachtungen"}{" "}
                    importieren
                  </button>
                )}
                <button
                  onClick={handleZuruecksetzen}
                  className="bg-stone-200 text-stone-700 px-4 py-2 rounded text-sm hover:bg-stone-300 transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
