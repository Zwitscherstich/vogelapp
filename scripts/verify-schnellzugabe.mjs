// Zaehlt die Verknuepfungen einer Beobachtung direkt in der Datenbank.
// Aufruf: node scripts/verify-schnellzugabe.mjs [beobachtungId]
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const wert = (schluessel) =>
  env.split("\n").find((z) => z.startsWith(schluessel))?.split("=")[1]?.trim();

const url = wert("NEXT_PUBLIC_SUPABASE_URL");
const key = wert("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const kopf = { apikey: key, Authorization: `Bearer ${key}` };

async function alleZeilen(pfad) {
  const alle = [];
  let von = 0;
  for (;;) {
    const r = await fetch(`${url}/rest/v1/${pfad}&offset=${von}&limit=500`, {
      headers: kopf,
    });
    const teil = await r.json();
    if (!Array.isArray(teil) || teil.length === 0) break;
    alle.push(...teil);
    von += teil.length;
  }
  return alle;
}

const zeilen = await alleZeilen(
  "beobachtung_vogelarten?select=beobachtung_id,vogelart_id&order=id"
);

console.log(`Verknuepfungen gesamt: ${zeilen.length}`);

const doppelt = new Map();
for (const z of zeilen) {
  const k = `${z.beobachtung_id}|${z.vogelart_id}`;
  doppelt.set(k, (doppelt.get(k) ?? 0) + 1);
}
const duplikate = [...doppelt.values()].filter((n) => n > 1).length;
console.log(`Doppelte Paare: ${duplikate}`);
if (duplikate > 0) {
  console.error("FEHLER: Duplikate vorhanden");
  process.exit(1);
}

const ziel = process.argv[2];
if (ziel) {
  const n = zeilen.filter((z) => String(z.beobachtung_id) === ziel).length;
  console.log(`Beobachtung ${ziel}: ${n} Arten`);
}
