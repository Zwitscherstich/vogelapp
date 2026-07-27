// Prueft die beiden Abfragen aus snapshotAktualisieren gegen die echte
// Datenbank: neueste 10 Beobachtungen absteigend, alle Verknuepfungen
// vollstaendig (nicht bei 1000 abgeschnitten).
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const wert = (s) =>
  env.split("\n").find((z) => z.startsWith(s))?.split("=")[1]?.trim();

const url = wert("NEXT_PUBLIC_SUPABASE_URL");
const key = wert("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const kopf = { apikey: key, Authorization: `Bearer ${key}` };

const beob = await (
  await fetch(
    `${url}/rest/v1/beobachtungen?select=id,datum,ort,land&order=id.desc&limit=10`,
    { headers: kopf }
  )
).json();

console.log(`Beobachtungen geladen: ${beob.length} (erwartet: 10)`);
console.log(`Neueste id: ${beob[0]?.id} – Ziel-Vorgabe des FAB`);
if (beob.length < 2 || beob[0].id < beob[1].id) {
  console.error("FEHLER: nicht absteigend nach id sortiert");
  process.exit(1);
}

let alle = [];
for (let von = 0; ; von += 500) {
  const teil = await (
    await fetch(
      `${url}/rest/v1/beobachtung_vogelarten?select=beobachtung_id,vogelart_id,vogelarten(name)&order=id&offset=${von}&limit=500`,
      { headers: kopf }
    )
  ).json();
  if (!Array.isArray(teil) || teil.length === 0) break;
  alle = alle.concat(teil);
}

console.log(`Verknuepfungen geladen: ${alle.length}`);
// Genau 1000 ist die Signatur der stillen PostgREST-Kappung. Weniger als 1000
// ist bei einer kleinen Datenbank voellig normal und darf nicht fehlschlagen.
if (alle.length === 1000) {
  console.error(
    "FEHLER: exakt 1000 Zeilen – das ist die Signatur der stillen Kappung, " +
      "die Paginierung greift nicht"
  );
  process.exit(1);
}

const ohneNamen = alle.filter((z) => !z.vogelarten?.name).length;
console.log(`Zeilen ohne Artnamen: ${ohneNamen}`);
if (ohneNamen > 0) {
  console.error(
    `FEHLER: ${ohneNamen} Verknuepfungen ohne Artnamen – die Einbettung ` +
      "vogelarten(name) liefert nicht fuer alle Zeilen ein Ergebnis"
  );
  process.exit(1);
}

const proBeob = new Map();
for (const z of alle) {
  proBeob.set(z.beobachtung_id, (proBeob.get(z.beobachtung_id) ?? 0) + 1);
}
console.log(`Beobachtungen mit Arten: ${proBeob.size}`);
console.log(`Neueste Beobachtung hat ${proBeob.get(beob[0].id) ?? 0} Arten`);
