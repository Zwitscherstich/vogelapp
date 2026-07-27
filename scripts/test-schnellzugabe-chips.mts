import assert from "node:assert/strict";
import { chipsBerechnen, type Snapshot } from "../src/lib/schnellzugabeChips.ts";

function schnappschuss(): Snapshot {
  return {
    id: "aktuell",
    erstelltAm: "2026-07-27T10:00:00.000Z",
    beobachtungen: [
      { id: 30, datum: "2026-07-27", ort: "Garten", land: "D",
        arten: [{ id: 1, name: "Amsel" }] },
      { id: 29, datum: "2026-07-26", ort: "Park", land: "D",
        arten: [{ id: 1, name: "Amsel" }, { id: 2, name: "Kohlmeise" }] },
      { id: 28, datum: "2026-07-25", ort: "Park", land: "D",
        arten: [{ id: 2, name: "Kohlmeise" }, { id: 3, name: "Star" }] },
      { id: 27, datum: "2026-07-24", ort: "See", land: "D",
        arten: [{ id: 2, name: "Kohlmeise" }] },
      { id: 26, datum: "2026-07-23", ort: "See", land: "D",
        arten: [{ id: 4, name: "Elster" }] },
      { id: 25, datum: "2026-01-01", ort: "Alt", land: "D",
        arten: [{ id: 9, name: "Zaunkoenig" }] },
    ],
    topArten: [
      { id: 1, name: "Amsel", anzahl: 50 },
      { id: 2, name: "Kohlmeise", anzahl: 40 },
      { id: 7, name: "Buchfink", anzahl: 30 },
      { id: 8, name: "Rotkehlchen", anzahl: 20 },
    ],
  };
}

// Häufigkeit im Fenster bestimmt die Reihenfolge
const a = chipsBerechnen(schnappschuss(), 26);
assert.deepEqual(a.map((c) => c.name), [
  "Kohlmeise", "Amsel", "Star", "Buchfink", "Rotkehlchen",
]);

// Arten der Zielbeobachtung erscheinen nicht
const b = chipsBerechnen(schnappschuss(), 29);
assert.ok(!b.some((c) => c.name === "Amsel"));
assert.ok(!b.some((c) => c.name === "Kohlmeise"));
// Star und Elster haben beide Haeufigkeit 1 und stehen nicht in topArten,
// entscheidet also der alphabetische Gleichstand-Tiebreak.
assert.deepEqual(b.slice(0, 2).map((c) => c.name), ["Elster", "Star"]);

// Fenster endet nach fensterGroesse Beobachtungen
assert.ok(!a.some((c) => c.name === "Zaunkoenig"));

// Auffüllung aus topArten, ohne Duplikate
const namen = a.map((c) => c.name);
assert.equal(new Set(namen).size, namen.length);

// maxChips wird eingehalten
assert.ok(chipsBerechnen(schnappschuss(), 26, 2).length === 2);

// Unbekannte Ziel-Id: nichts wird ausgeschlossen, kein Absturz
assert.ok(chipsBerechnen(schnappschuss(), 999).length > 0);

// Leerer Snapshot liefert eine leere Liste
const leer: Snapshot = {
  id: "aktuell", erstelltAm: "", beobachtungen: [], topArten: [],
};
assert.deepEqual(chipsBerechnen(leer, 1), []);

// Gleichstand im Fenster: die Gesamthaeufigkeit entscheidet vor dem Alphabet.
// Beide Arten haben Fensterhaeufigkeit 1; alphabetisch käme "Fitis" zuerst,
// wegen der hoeheren Gesamthaeufigkeit muss aber "Zilpzalp" vorn stehen.
const gleichstand: Snapshot = {
  id: "aktuell",
  erstelltAm: "2026-07-27T10:00:00.000Z",
  beobachtungen: [
    { id: 2, datum: "2026-07-27", ort: "A", land: "D",
      arten: [{ id: 11, name: "Zilpzalp" }, { id: 12, name: "Fitis" }] },
    { id: 1, datum: "2026-07-26", ort: "A", land: "D", arten: [] },
  ],
  topArten: [
    { id: 12, name: "Fitis", anzahl: 5 },
    { id: 11, name: "Zilpzalp", anzahl: 99 },
  ],
};
assert.deepEqual(
  chipsBerechnen(gleichstand, 1).map((c) => c.name),
  ["Zilpzalp", "Fitis"]
);

console.log("schnellzugabeChips: alle Tests bestanden");
