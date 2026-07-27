# Schnellzugabe-FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating action button that appends a bird species to an existing observation in two taps — one tap for each additional species — and works offline.

**Architecture:** A pure ranking module (zero imports, directly executable by Node for tests) computes chip suggestions from an IndexedDB snapshot of recent observations. A single `artHinzufuegen()` function hides the online/offline split so the UI never branches on connectivity; offline writes queue to a new object store and drain through the existing `syncOfflineData()`.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, Tailwind CSS 4, Supabase JS 2.101, IndexedDB.

Spec: `docs/superpowers/specs/2026-07-27-schnellzugabe-fab-design.md`

## Global Constraints

- **Language:** All identifiers, comments, and UI copy in German, matching the existing codebase. Umlauts are used normally in UI strings and comments.
- **No new dependencies.** Node v24 executes TypeScript natively, so tests run via `node path/to/file.ts` with `node:assert/strict`. Do not add a test framework.
- **`src/lib/schnellzugabeChips.ts` must have zero imports.** Node's TypeScript support requires explicit `.ts` extensions on relative imports, while this project's `tsconfig.json` (`moduleResolution: bundler`, no `allowImportingTsExtensions`) forbids them in source. A self-contained module satisfies both. Types are declared there and imported *from* it by other modules.
- **Never delete link rows.** This feature only ever inserts into `beobachtung_vogelarten`. The data-loss incident of 2026-07-27 came from a delete-then-reinsert path; no new code may delete links.
- **Never issue an unpaginated `.select()`** on `beobachtungen`, `beobachtung_vogelarten`, or `vogelarten`. Always use `ladeAlleZeilen()` from `src/lib/supabase.ts` with a stable `.order()`. PostgREST silently truncates at 1000 rows.
- **Do not assume a unique constraint** on `(beobachtung_id, vogelart_id)`. Verified 2026-07-27: 1055 rows, zero duplicates, but no constraint confirmed. Guard client-side *and* treat Postgres error `23505` as success.
- **Verify writes against the database, not the UI.** Row counts via PostgREST, using the anon key from `.env.local`.
- Every task ends with a passing `npx tsc --noEmit` and `npx next build`.

## File Structure

**Create:**
- `src/lib/schnellzugabeChips.ts` — types + pure ranking function. Zero imports.
- `src/lib/schnellzugabeSnapshot.ts` — build/read/write the IndexedDB snapshot.
- `src/lib/schnellzugabe.ts` — `artHinzufuegen()`, the online/offline write path.
- `src/components/SchnellZugabeSheet.tsx` — target bar, search, chips, burst counter.
- `src/components/SchnellZugabeFab.tsx` — button + sheet open/close state.
- `scripts/test-schnellzugabe-chips.ts` — assert-based tests for the ranking function.
- `scripts/verify-schnellzugabe.mjs` — counts rows in the database before/after.

**Modify:**
- `src/lib/offlineDb.ts` — `DB_VERSION` 1→2, two new stores, queue helpers, `getPendingCount()`.
- `src/lib/sync.ts` — third sync step draining the queue.
- `src/app/layout.tsx` — mount the FAB.
- `src/app/beobachtungen/page.tsx` — opportunistic snapshot refresh.
- `package.json` — `test:chips` script (no dependency changes).

---

### Task 1: Pure chip-ranking function

**Files:**
- Create: `src/lib/schnellzugabeChips.ts`
- Create: `scripts/test-schnellzugabe-chips.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `SnapshotArt`, `SnapshotBeobachtung`, `TopArt`, `Snapshot`, `ChipVorschlag`, `ZugabeErgebnis`, and `chipsBerechnen(snapshot, zielId, maxChips?, fensterGroesse?): ChipVorschlag[]`. Every later task imports its types from this module.

Note the snapshot stores `arten: { id, name }[]` per observation rather than the parallel `artIds`/`artNamen` arrays sketched in the spec. Parallel arrays must stay index-aligned through every transformation; a single array of pairs makes misalignment impossible.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-schnellzugabe-chips.ts`:

```ts
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

console.log("schnellzugabeChips: alle Tests bestanden");
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node scripts/test-schnellzugabe-chips.ts
```

Expected: FAIL — `Cannot find module ... schnellzugabeChips.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/schnellzugabeChips.ts`. **This file must not import anything.**

```ts
// Reine Rangfolge-Logik für die Schnellzugabe.
//
// Bewusst ohne Importe: Node fuehrt TypeScript nur mit expliziten
// .ts-Endungen bei relativen Importen aus, waehrend die tsconfig des
// Projekts (moduleResolution "bundler") genau diese Endungen verbietet.
// Ein Modul ohne Importe erfuellt beides und bleibt direkt testbar.

export interface SnapshotArt {
  id: number;
  name: string;
}

export interface SnapshotBeobachtung {
  id: number;
  datum: string;
  ort: string;
  land: string;
  arten: SnapshotArt[];
}

export interface TopArt {
  id: number;
  name: string;
  anzahl: number;
}

export interface Snapshot {
  id: "aktuell";
  erstelltAm: string;
  /** Die letzten 10 Beobachtungen, neueste zuerst. */
  beobachtungen: SnapshotBeobachtung[];
  /** Gesamthaeufigkeit ueber alle Beobachtungen, zum Auffuellen. */
  topArten: TopArt[];
}

export interface ChipVorschlag {
  id: number;
  name: string;
}

export type ZugabeErgebnis =
  | { status: "hinzugefuegt" }
  | { status: "vorhanden" }
  | { status: "wartet" }
  | { status: "fehler"; meldung: string };

export const MAX_CHIPS = 8;
export const FENSTER_GROESSE = 5;
export const ZIEL_LISTE_LAENGE = 10;

/**
 * Vorschlaege fuer die Chip-Reihe.
 *
 * Haeufigkeit innerhalb der letzten `fensterGroesse` Beobachtungen, aufgefuellt
 * mit den insgesamt haeufigsten Arten. Arten, die die Zielbeobachtung bereits
 * enthaelt, werden entfernt.
 *
 * Ein Fenster ueber Beobachtungen statt ueber Tage ist Absicht: ein Zeitfenster
 * waere nach einer Pause leer - also genau dann, wenn die App fuer eine neue
 * Sitzung geoeffnet wird.
 */
export function chipsBerechnen(
  snapshot: Snapshot,
  zielId: number,
  maxChips: number = MAX_CHIPS,
  fensterGroesse: number = FENSTER_GROESSE
): ChipVorschlag[] {
  const ziel = snapshot.beobachtungen.find((b) => b.id === zielId);
  const vorhanden = new Set((ziel?.arten ?? []).map((a) => a.id));

  const gesamt = new Map<number, number>();
  for (const t of snapshot.topArten) gesamt.set(t.id, t.anzahl);

  // 1. Haeufigkeit im Fenster zaehlen
  const zaehler = new Map<number, { name: string; anzahl: number }>();
  for (const beob of snapshot.beobachtungen.slice(0, fensterGroesse)) {
    for (const art of beob.arten) {
      const vorher = zaehler.get(art.id);
      if (vorher) vorher.anzahl += 1;
      else zaehler.set(art.id, { name: art.name, anzahl: 1 });
    }
  }

  // 2. Bereits erfasste Arten entfernen und sortieren
  const kandidaten = [...zaehler.entries()]
    .filter(([id]) => !vorhanden.has(id))
    .map(([id, v]) => ({ id, name: v.name, anzahl: v.anzahl }))
    .sort(
      (a, b) =>
        b.anzahl - a.anzahl ||
        (gesamt.get(b.id) ?? 0) - (gesamt.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name, "de")
    );

  const ergebnis: ChipVorschlag[] = kandidaten.map((k) => ({
    id: k.id,
    name: k.name,
  }));

  // 3. Mit Gesamtfavoriten auffuellen
  if (ergebnis.length < maxChips) {
    const schonDrin = new Set(ergebnis.map((c) => c.id));
    const auffuellung = snapshot.topArten
      .filter((t) => !vorhanden.has(t.id) && !schonDrin.has(t.id))
      .sort(
        (a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de")
      );
    for (const t of auffuellung) {
      if (ergebnis.length >= maxChips) break;
      ergebnis.push({ id: t.id, name: t.name });
    }
  }

  return ergebnis.slice(0, maxChips);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node scripts/test-schnellzugabe-chips.ts
```

Expected: `schnellzugabeChips: alle Tests bestanden`

- [ ] **Step 5: Add the npm script**

In `package.json`, inside `"scripts"`, after `"lint": "next lint"`, add:

```json
"test:chips": "node scripts/test-schnellzugabe-chips.ts"
```

Verify with `npm run test:chips`. No dependency changes — do not run `npm install`.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/schnellzugabeChips.ts scripts/test-schnellzugabe-chips.ts package.json
git commit -m "Schnellzugabe: reine Rangfolge-Logik fuer Chip-Vorschlaege"
```

---

### Task 2: IndexedDB stores for snapshot and queue

**Files:**
- Modify: `src/lib/offlineDb.ts`

**Interfaces:**
- Consumes: `Snapshot` from `./schnellzugabeChips`.
- Produces: `speicherSnapshot(s)`, `ladeSnapshot()`, `ArtNachtrag`, `saveArtNachtrag(n)`, `getArtNachtraege()`, `deleteArtNachtrag(tempId)`. `getPendingCount()` now includes queued additions.

The database version goes 1 → 2. `onupgradeneeded` must create only stores that don't already exist, so an existing v1 database upgrades without losing cached species.

- [ ] **Step 1: Bump the version and add the stores**

In `src/lib/offlineDb.ts`, change `const DB_VERSION = 1;` to:

```ts
const DB_VERSION = 2;
```

Inside `request.onupgradeneeded`, after the existing `offlineVogelarten` block, add:

```ts
      // v2: Schnellzugabe – Snapshot und Warteschlange fuer Nachtraege
      if (!db.objectStoreNames.contains("schnellzugabeSnapshot")) {
        db.createObjectStore("schnellzugabeSnapshot", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("offlineArtNachtraege")) {
        db.createObjectStore("offlineArtNachtraege", {
          keyPath: "tempId",
          autoIncrement: true,
        });
      }
```

The existing guards mean a v1 database keeps its cached species; only the two new stores are added.

- [ ] **Step 2: Add the import and the snapshot helpers**

At the top of `src/lib/offlineDb.ts`, add:

```ts
import type { Snapshot } from "./schnellzugabeChips";
```

At the end of the file, before the `// --- Pending count ---` section, add:

```ts
// --- Schnellzugabe: Snapshot ---

export async function speicherSnapshot(snapshot: Snapshot): Promise<void> {
  await doTransaction("schnellzugabeSnapshot", "readwrite", (store) =>
    store.put(snapshot)
  );
}

export async function ladeSnapshot(): Promise<Snapshot | null> {
  const treffer = await doTransaction<Snapshot | undefined>(
    "schnellzugabeSnapshot",
    "readonly",
    (store) => store.get("aktuell")
  );
  return treffer ?? null;
}

// --- Schnellzugabe: Warteschlange ---

export interface ArtNachtrag {
  tempId?: number;
  beobachtungId: number;
  /** Bestehende Art. Genau eines von vogelartId / neuerName ist gesetzt. */
  vogelartId?: number;
  /** Neue Art, die beim Sync erst angelegt werden muss. */
  neuerName?: string;
}

export async function saveArtNachtrag(nachtrag: ArtNachtrag): Promise<void> {
  await doTransaction("offlineArtNachtraege", "readwrite", (store) =>
    store.add(nachtrag)
  );
}

export async function getArtNachtraege(): Promise<ArtNachtrag[]> {
  return getAllFromStore("offlineArtNachtraege");
}

export async function deleteArtNachtrag(tempId: number): Promise<void> {
  await doTransaction("offlineArtNachtraege", "readwrite", (store) =>
    store.delete(tempId)
  );
}
```

- [ ] **Step 3: Include the queue in the pending count**

Replace the existing `getPendingCount` with:

```ts
export async function getPendingCount(): Promise<number> {
  const beob = await getOfflineBeobachtungen();
  const arten = await getOfflineVogelarten();
  const nachtraege = await getArtNachtraege();
  return beob.length + arten.length + nachtraege.length;
}
```

`SyncStatus` reads this already, so queued additions surface in the UI with no change there.

- [ ] **Step 4: Verify the upgrade in the browser**

```bash
npm run dev
```

Open the app, then DevTools → Application → IndexedDB → `vogeltagebuch`. Confirm version 2 and four stores: `vogelarten`, `offlineBeobachtungen`, `offlineVogelarten`, `schnellzugabeSnapshot`, `offlineArtNachtraege`. Confirm `vogelarten` still holds its cached rows.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/offlineDb.ts
git commit -m "Schnellzugabe: IndexedDB v2 mit Snapshot- und Nachtrag-Store"
```

---

### Task 3: Build and read the snapshot

**Files:**
- Create: `src/lib/schnellzugabeSnapshot.ts`

**Interfaces:**
- Consumes: `ladeAlleZeilen`, `supabase` from `./supabase`; `speicherSnapshot`, `ladeSnapshot` from `./offlineDb`; types from `./schnellzugabeChips`.
- Produces: `snapshotAktualisieren(): Promise<Snapshot | null>`, `snapshotHolen(): Promise<Snapshot | null>`, `SNAPSHOT_MAX_ALTER_MS`.

- [ ] **Step 1: Write the module**

Create `src/lib/schnellzugabeSnapshot.ts`:

```ts
import { supabase, ladeAlleZeilen } from "./supabase";
import { speicherSnapshot, ladeSnapshot } from "./offlineDb";
import {
  ZIEL_LISTE_LAENGE,
  type Snapshot,
  type SnapshotBeobachtung,
  type TopArt,
} from "./schnellzugabeChips";

/** Aelter als eine Minute gilt als veraltet. */
export const SNAPSHOT_MAX_ALTER_MS = 60_000;

interface VerknuepfungsZeile {
  beobachtung_id: number;
  vogelart_id: number;
  vogelarten: { name: string } | null;
}

/**
 * Laedt den aktuellen Stand aus Supabase und legt ihn in IndexedDB ab.
 * Gibt null zurueck, wenn nichts geladen werden konnte.
 */
export async function snapshotAktualisieren(): Promise<Snapshot | null> {
  try {
    const [beobResult, verknuepfungen] = await Promise.all([
      supabase
        .from("beobachtungen")
        .select("id, datum, ort, land")
        .order("id", { ascending: false })
        .limit(ZIEL_LISTE_LAENGE),
      // Immer seitenweise: PostgREST schneidet sonst still bei 1000 Zeilen ab.
      ladeAlleZeilen<VerknuepfungsZeile>((von, bis) =>
        supabase
          .from("beobachtung_vogelarten")
          .select("beobachtung_id, vogelart_id, vogelarten(name)")
          .order("id")
          .range(von, bis)
      ),
    ]);

    if (beobResult.error || !beobResult.data) return null;

    // Arten je Beobachtung buendeln
    const proBeobachtung = new Map<number, { id: number; name: string }[]>();
    // Gesamthaeufigkeit ueber alle Beobachtungen
    const gesamt = new Map<number, { name: string; anzahl: number }>();

    for (const z of verknuepfungen) {
      const name = (z.vogelarten as unknown as { name: string })?.name ?? "";
      if (!name) continue;

      const liste = proBeobachtung.get(z.beobachtung_id) ?? [];
      liste.push({ id: z.vogelart_id, name });
      proBeobachtung.set(z.beobachtung_id, liste);

      const g = gesamt.get(z.vogelart_id);
      if (g) g.anzahl += 1;
      else gesamt.set(z.vogelart_id, { name, anzahl: 1 });
    }

    const beobachtungen: SnapshotBeobachtung[] = beobResult.data.map((b) => ({
      id: b.id,
      datum: b.datum,
      ort: b.ort,
      land: b.land,
      arten: proBeobachtung.get(b.id) ?? [],
    }));

    const topArten: TopArt[] = [...gesamt.entries()]
      .map(([id, v]) => ({ id, name: v.name, anzahl: v.anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl || a.name.localeCompare(b.name, "de"))
      .slice(0, 50);

    const snapshot: Snapshot = {
      id: "aktuell",
      erstelltAm: new Date().toISOString(),
      beobachtungen,
      topArten,
    };

    await speicherSnapshot(snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

/** Liest den zwischengespeicherten Stand, ohne zu laden. */
export async function snapshotHolen(): Promise<Snapshot | null> {
  try {
    return await ladeSnapshot();
  } catch {
    return null;
  }
}
```

`beobachtungen` is ordered by `id` descending and limited to 10, so `beobachtungen[0]` is always the newest observation — the default target.

- [ ] **Step 2: Verify the query shape against the live database**

The module itself needs a browser (IndexedDB), but the Supabase half can be
checked headlessly. This confirms the two queries return what the grouping
code expects — the part most likely to be wrong.

Create `scripts/check-snapshot-queries.mjs`:

```js
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
if (alle.length <= 1000) {
  console.error(
    `WARNUNG: nur ${alle.length} Zeilen – bei genau 1000 waere das die stille Kappung`
  );
}

const ohneNamen = alle.filter((z) => !z.vogelarten?.name).length;
console.log(`Zeilen ohne Artnamen: ${ohneNamen}`);

const proBeob = new Map();
for (const z of alle) {
  proBeob.set(z.beobachtung_id, (proBeob.get(z.beobachtung_id) ?? 0) + 1);
}
console.log(`Beobachtungen mit Arten: ${proBeob.size}`);
console.log(`Neueste Beobachtung hat ${proBeob.get(beob[0].id) ?? 0} Arten`);
```

Run it:

```bash
node scripts/check-snapshot-queries.mjs
```

Expected: 10 observations, descending ids, more than 1000 links (1055 as of
2026-07-27), zero rows without a species name. A count of exactly 1000 means
the pagination broke and is a blocker.

Commit this script together with the module in Step 3.

- [ ] **Step 3: Typecheck and commit**

```bash
npx tsc --noEmit
npx next build
git add src/lib/schnellzugabeSnapshot.ts scripts/check-snapshot-queries.mjs
git commit -m "Schnellzugabe: Snapshot aus Supabase aufbauen und zwischenspeichern"
```

---

### Task 4: The write path

**Files:**
- Create: `src/lib/schnellzugabe.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`; `saveArtNachtrag` from `./offlineDb`; `ZugabeErgebnis` from `./schnellzugabeChips`.
- Produces: `artHinzufuegen(beobachtungId, art, online): Promise<ZugabeErgebnis>`.

`online` is passed in rather than read inside, so the caller uses the app's existing `useOnlineStatus()` hook and the function stays free of React and of `navigator` access.

- [ ] **Step 1: Write the module**

Create `src/lib/schnellzugabe.ts`:

```ts
import { supabase } from "./supabase";
import { saveArtNachtrag } from "./offlineDb";
import type { ZugabeErgebnis } from "./schnellzugabeChips";

/** Postgres: unique_violation. */
const UNIQUE_VERLETZUNG = "23505";

export type ZuzufuegendeArt = { id: number } | { neuerName: string };

/**
 * Haengt eine Vogelart an eine bestehende Beobachtung an.
 *
 * Diese Funktion loescht niemals Verknuepfungen - sie fuegt nur hinzu.
 * Online wird direkt geschrieben, offline in die Warteschlange gelegt.
 */
export async function artHinzufuegen(
  beobachtungId: number,
  art: ZuzufuegendeArt,
  online: boolean
): Promise<ZugabeErgebnis> {
  if (!online) {
    try {
      await saveArtNachtrag({
        beobachtungId,
        vogelartId: "id" in art ? art.id : undefined,
        neuerName: "neuerName" in art ? art.neuerName : undefined,
      });
      return { status: "wartet" };
    } catch (e: unknown) {
      return { status: "fehler", meldung: fehlertext(e) };
    }
  }

  try {
    const vogelartId = "id" in art ? art.id : await artAnlegen(art.neuerName);
    if (vogelartId === null) {
      return { status: "fehler", meldung: "Vogelart konnte nicht angelegt werden." };
    }

    // Vorab pruefen: die Datenbank hat moeglicherweise keinen Unique-Constraint
    const { data: vorhanden } = await supabase
      .from("beobachtung_vogelarten")
      .select("id")
      .eq("beobachtung_id", beobachtungId)
      .eq("vogelart_id", vogelartId)
      .limit(1);

    if (vorhanden && vorhanden.length > 0) return { status: "vorhanden" };

    const { error } = await supabase
      .from("beobachtung_vogelarten")
      .insert({ beobachtung_id: beobachtungId, vogelart_id: vogelartId });

    if (error) {
      // Falls doch ein Constraint existiert und parallel geschrieben wurde:
      // die Art ist verknuepft, das Ziel ist erreicht.
      if ((error as { code?: string }).code === UNIQUE_VERLETZUNG) {
        return { status: "vorhanden" };
      }
      return { status: "fehler", meldung: error.message };
    }

    return { status: "hinzugefuegt" };
  } catch (e: unknown) {
    return { status: "fehler", meldung: fehlertext(e) };
  }
}

/** Legt eine Art an oder liefert die Id einer gleichnamigen bestehenden. */
async function artAnlegen(name: string): Promise<number | null> {
  const sauber = name.trim();
  if (!sauber) return null;

  const { data: vorhanden } = await supabase
    .from("vogelarten")
    .select("id")
    .eq("name", sauber)
    .limit(1);

  if (vorhanden && vorhanden.length > 0) return vorhanden[0].id;

  const { data, error } = await supabase
    .from("vogelarten")
    .insert({ name: sauber })
    .select("id")
    .single();

  if (error || !data) return null;
  return data.id;
}

function fehlertext(e: unknown): string {
  return e instanceof Error ? e.message : "Unbekannter Fehler";
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
npx next build
git add src/lib/schnellzugabe.ts
git commit -m "Schnellzugabe: Schreibpfad mit Online- und Offline-Zweig"
```

---

### Task 5: Drain the queue during sync

**Files:**
- Modify: `src/lib/sync.ts`
- Modify: `src/app/beobachtungen/page.tsx`

**Interfaces:**
- Consumes: `getArtNachtraege`, `deleteArtNachtrag` from `./offlineDb`; `snapshotAktualisieren` from `./schnellzugabeSnapshot`.
- Produces: no new exports. `syncOfflineData()` keeps returning the number of synced entries.

Additions are drained **last**, so a queued addition can attach to an observation that was itself only just synced in step 2.

- [ ] **Step 1: Extend the imports**

In `src/lib/sync.ts`, replace the import block from `./offlineDb` with:

```ts
import {
  getOfflineBeobachtungen,
  deleteOfflineBeobachtung,
  getOfflineVogelarten,
  deleteOfflineVogelart,
  getArtNachtraege,
  deleteArtNachtrag,
} from "./offlineDb";
```

- [ ] **Step 2: Add the third sync step**

In `syncOfflineData`, immediately before `return synced;`, insert:

```ts
  // 3. Nachtraege aus der Schnellzugabe – bewusst zuletzt, damit sie auf
  //    Beobachtungen zutreffen koennen, die gerade erst synchronisiert wurden.
  const nachtraege = await getArtNachtraege();
  for (const n of nachtraege) {
    try {
      let vogelartId = n.vogelartId ?? null;

      if (vogelartId === null && n.neuerName) {
        const name = n.neuerName.trim();
        const { data: vorhandeneArt } = await supabase
          .from("vogelarten")
          .select("id")
          .eq("name", name)
          .limit(1);

        if (vorhandeneArt && vorhandeneArt.length > 0) {
          vogelartId = vorhandeneArt[0].id;
        } else {
          const { data: neueArt, error } = await supabase
            .from("vogelarten")
            .insert({ name })
            .select("id")
            .single();
          if (error || !neueArt) continue;
          vogelartId = neueArt.id;
        }
      }

      if (vogelartId === null) {
        // Weder Id noch Name: der Eintrag ist unbrauchbar, sonst bliebe er ewig.
        await deleteArtNachtrag(n.tempId!);
        continue;
      }

      // Existiert die Zielbeobachtung ueberhaupt noch?
      const { data: zielBeob } = await supabase
        .from("beobachtungen")
        .select("id")
        .eq("id", n.beobachtungId)
        .limit(1);

      if (!zielBeob || zielBeob.length === 0) {
        await deleteArtNachtrag(n.tempId!);
        continue;
      }

      const { data: schonDa } = await supabase
        .from("beobachtung_vogelarten")
        .select("id")
        .eq("beobachtung_id", n.beobachtungId)
        .eq("vogelart_id", vogelartId)
        .limit(1);

      if (!schonDa || schonDa.length === 0) {
        const { error } = await supabase
          .from("beobachtung_vogelarten")
          .insert({ beobachtung_id: n.beobachtungId, vogelart_id: vogelartId });
        // 23505 bedeutet: parallel bereits angelegt – ebenfalls erledigt.
        if (error && (error as { code?: string }).code !== "23505") continue;
      }

      await deleteArtNachtrag(n.tempId!);
      synced++;
    } catch {
      continue;
    }
  }
```

The existence check before inserting is what makes a repeated sync safe without relying on a database constraint.

- [ ] **Step 3: Refresh the snapshot on the Beobachtungen page**

In `src/app/beobachtungen/page.tsx`, add to the imports:

```ts
import { snapshotAktualisieren } from "@/lib/schnellzugabeSnapshot";
```

In `ladeBeobachtungen`, replace `setLaden(false);` at the end of the function (the one after `setBeobachtungen(ergebnisse);`) with:

```ts
    setLaden(false);

    // Beilaeufig: die Daten sind ohnehin geladen, der FAB profitiert davon.
    void snapshotAktualisieren();
```

- [ ] **Step 4: Verify the drain logic reads correctly**

The queue lives in IndexedDB, so a genuine round trip needs a browser and is
covered by Task 8 Step 4. What must be confirmed here, by reading the code:

1. The additions block sits **after** the observations loop and **before**
   `return synced;`.
2. Every path through the loop either `continue`s or reaches
   `deleteArtNachtrag(n.tempId!)` — an entry that is neither deleted nor
   skipped would be retried forever.
3. Entries are deleted (not retried) when the target observation is gone and
   when neither `vogelartId` nor `neuerName` is set.
4. The insert only runs when the existence check returned nothing, and error
   code `23505` is treated as success.

State each of these four as confirmed in the report, quoting the line that
shows it. This is a reading check, not a substitute for Task 8.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
npx next build
git add src/lib/sync.ts src/app/beobachtungen/page.tsx
git commit -m "Schnellzugabe: Nachtraege beim Sync abarbeiten"
```

---

### Task 6: The sheet

**Files:**
- Create: `src/components/SchnellZugabeSheet.tsx`

**Interfaces:**
- Consumes: `chipsBerechnen`, `MAX_CHIPS`, types from `@/lib/schnellzugabeChips`; `artHinzufuegen` from `@/lib/schnellzugabe`; `snapshotAktualisieren`, `snapshotHolen`, `SNAPSHOT_MAX_ALTER_MS` from `@/lib/schnellzugabeSnapshot`; `getCachedVogelarten` from `@/lib/offlineDb`; `supabase`, `ladeAlleZeilen` from `@/lib/supabase`; `useOnlineStatus` from `@/lib/useOnlineStatus`.
- Produces: default export `SchnellZugabeSheet({ onSchliessen }: { onSchliessen: () => void })`.

Chips are filtered **when the sheet opens**, held in `chipBasis`, and not recomputed on each add — a tapped chip keeps its slot so the row cannot reflow under the user's thumb mid-burst.

- [ ] **Step 1: Write the component**

Create `src/components/SchnellZugabeSheet.tsx`:

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase, ladeAlleZeilen } from "@/lib/supabase";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { getCachedVogelarten } from "@/lib/offlineDb";
import { artHinzufuegen } from "@/lib/schnellzugabe";
import {
  snapshotAktualisieren,
  snapshotHolen,
  SNAPSHOT_MAX_ALTER_MS,
} from "@/lib/schnellzugabeSnapshot";
import {
  chipsBerechnen,
  type ChipVorschlag,
  type Snapshot,
} from "@/lib/schnellzugabeChips";

type ArtStatus = "hinzugefuegt" | "wartet" | "vorhanden";

export default function SchnellZugabeSheet({
  onSchliessen,
}: {
  onSchliessen: () => void;
}) {
  const online = useOnlineStatus();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [zielId, setZielId] = useState<number | null>(null);
  const [zielListeOffen, setZielListeOffen] = useState(false);
  const [chipBasis, setChipBasis] = useState<ChipVorschlag[]>([]);
  const [status, setStatus] = useState<Record<number, ArtStatus>>({});
  const [anzahl, setAnzahl] = useState(0);
  const [suche, setSuche] = useState("");
  const [alleArten, setAlleArten] = useState<{ id: number; name: string }[]>([]);
  const [fehler, setFehler] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  // Snapshot laden: frisch holen wenn online und veraltet, sonst zwischengespeichert
  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      let s = await snapshotHolen();
      const veraltet =
        !s || Date.now() - new Date(s.erstelltAm).getTime() > SNAPSHOT_MAX_ALTER_MS;
      if (online && veraltet) {
        const frisch = await snapshotAktualisieren();
        if (frisch) s = frisch;
      }
      if (abgebrochen) return;
      setSnapshot(s);
      setZielId(s?.beobachtungen[0]?.id ?? null);
      setLaedt(false);
    }
    laden();
    return () => {
      abgebrochen = true;
    };
  }, [online]);

  // Artenliste fuer die Suche
  useEffect(() => {
    let abgebrochen = false;
    async function laden() {
      if (online) {
        const arten = await ladeAlleZeilen<{ id: number; name: string }>(
          (von, bis) =>
            supabase
              .from("vogelarten")
              .select("id, name")
              .order("name")
              .range(von, bis)
        );
        if (!abgebrochen && arten.length > 0) setAlleArten(arten);
      } else {
        const arten = await getCachedVogelarten();
        if (!abgebrochen) setAlleArten(arten);
      }
    }
    laden();
    return () => {
      abgebrochen = true;
    };
  }, [online]);

  // Chips einmal je Ziel festlegen – nicht bei jeder Zugabe neu berechnen,
  // sonst bricht die Reihe waehrend eines Bursts unter dem Daumen um.
  useEffect(() => {
    if (!snapshot || zielId === null) return;
    setChipBasis(chipsBerechnen(snapshot, zielId));
    setStatus({});
    setAnzahl(0);
  }, [snapshot, zielId]);

  const ziel = snapshot?.beobachtungen.find((b) => b.id === zielId) ?? null;

  const vorhandeneIds = useMemo(
    () => new Set((ziel?.arten ?? []).map((a) => a.id)),
    [ziel]
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return [];
    return alleArten
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [suche, alleArten]);

  const exakterTreffer = alleArten.some(
    (a) => a.name.toLowerCase() === suche.trim().toLowerCase()
  );

  async function hinzufuegen(art: { id: number } | { neuerName: string }) {
    if (zielId === null || beschaeftigt) return;
    setBeschaeftigt(true);
    setFehler("");

    const ergebnis = await artHinzufuegen(zielId, art, online);

    if (ergebnis.status === "fehler") {
      setFehler(ergebnis.meldung);
    } else {
      if ("id" in art) {
        setStatus((s) => ({ ...s, [art.id]: ergebnis.status }));
      }
      if (ergebnis.status !== "vorhanden") setAnzahl((n) => n + 1);
      setSuche("");
    }
    setBeschaeftigt(false);
  }

  function datumKurz(iso: string) {
    const heute = new Date().toISOString().split("T")[0];
    if (iso === heute) return "heute";
    return new Date(iso + "T00:00:00").toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Schliessen"
        onClick={onSchliessen}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 rounded-full bg-stone-300" />
        </div>

        {laedt ? (
          <p className="px-4 py-6 text-sm text-stone-500">Lade…</p>
        ) : !ziel ? (
          <div className="px-4 py-6 space-y-3">
            <p className="text-sm text-stone-600">
              Noch keine Beobachtung vorhanden
              {!online && " – und offline sind keine Daten zwischengespeichert"}.
            </p>
            <a
              href="/"
              className="inline-block bg-emerald-600 text-white px-4 py-2 rounded text-sm"
            >
              Neue Beobachtung anlegen
            </a>
          </div>
        ) : (
          <>
            {/* Zielleiste */}
            <button
              onClick={() => setZielListeOffen((o) => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 border-b border-stone-200 text-left"
            >
              <span className="text-emerald-700">→</span>
              <span className="font-medium text-sm">
                {ziel.ort} ({ziel.land})
              </span>
              <span className="text-stone-500 text-sm">
                {datumKurz(ziel.datum)}
              </span>
              <span className="ml-auto text-stone-400 text-xs">
                {zielListeOffen ? "▲" : "▼"} ändern
              </span>
            </button>

            {!online && (
              <p className="px-4 py-1.5 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                Offline – Stand zwischengespeichert, Zugaben werden später synchronisiert.
              </p>
            )}

            {zielListeOffen && (
              <div className="border-b border-stone-200 max-h-52 overflow-y-auto">
                {snapshot!.beobachtungen.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => {
                      setZielId(b.id);
                      setZielListeOffen(false);
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-sm border-b border-stone-100 ${
                      b.id === zielId ? "bg-emerald-50 text-emerald-800" : ""
                    }`}
                  >
                    {b.ort} ({b.land})
                    <span className="text-stone-400 ml-2 text-xs">
                      {datumKurz(b.datum)} · {b.arten.length} Arten
                    </span>
                  </button>
                ))}
              </div>
            )}

            {fehler && (
              <p className="mx-4 my-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                {fehler}
              </p>
            )}

            {/* Suche – bewusst ohne Autofokus, damit die Tastatur die Chips nicht verdeckt */}
            <div className="px-4 pt-3">
              <input
                type="text"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder="Suchen…"
                className="border border-stone-300 rounded px-3 py-2 w-full text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {suche.trim() ? (
              <div className="px-4 py-2">
                {treffer.map((a) => {
                  const drin = vorhandeneIds.has(a.id) || status[a.id] === "vorhanden";
                  const gesetzt = status[a.id] === "hinzugefuegt" || status[a.id] === "wartet";
                  return (
                    <button
                      key={a.id}
                      disabled={drin || gesetzt || beschaeftigt}
                      onClick={() => hinzufuegen({ id: a.id })}
                      className={`block w-full text-left px-3 py-2.5 text-sm border-b border-stone-100 ${
                        drin || gesetzt ? "text-stone-400" : "hover:bg-stone-50"
                      }`}
                    >
                      {a.name}
                      {drin && <span className="ml-2 text-xs">✓ schon erfasst</span>}
                      {gesetzt && <span className="ml-2 text-xs">✓ hinzugefügt</span>}
                    </button>
                  );
                })}
                {!exakterTreffer && (
                  <button
                    disabled={beschaeftigt}
                    onClick={() => hinzufuegen({ neuerName: suche.trim() })}
                    className="block w-full text-left px-3 py-2.5 text-sm text-emerald-700 font-medium"
                  >
                    + „{suche.trim()}&quot; als neue Vogelart hinzufügen
                  </button>
                )}
              </div>
            ) : (
              <div className="px-4 py-3 flex flex-wrap gap-2">
                {chipBasis.map((c) => {
                  const s = status[c.id];
                  const erledigt = s === "hinzugefuegt" || s === "wartet";
                  return (
                    <button
                      key={c.id}
                      disabled={erledigt || s === "vorhanden" || beschaeftigt}
                      onClick={() => hinzufuegen({ id: c.id })}
                      className={`px-3 py-2.5 rounded-full text-sm border transition-colors ${
                        erledigt
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 opacity-60"
                          : s === "vorhanden"
                            ? "bg-stone-50 text-stone-400 border-stone-200"
                            : "bg-white text-stone-800 border-stone-300 active:bg-stone-100"
                      }`}
                    >
                      {erledigt ? "✓ " : ""}
                      {s === "wartet" ? "🕓 " : ""}
                      {c.name}
                      {s === "vorhanden" ? " (schon erfasst)" : ""}
                    </button>
                  );
                })}
                {chipBasis.length === 0 && (
                  <p className="text-sm text-stone-500">
                    Keine Vorschläge – über die Suche hinzufügen.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 px-4 py-3 border-t border-stone-200 sticky bottom-0 bg-white">
              <span className="text-sm text-stone-600">
                {anzahl === 0
                  ? "Noch nichts hinzugefügt"
                  : `${anzahl} hinzugefügt`}
              </span>
              <button
                onClick={onSchliessen}
                className="ml-auto bg-emerald-600 text-white px-5 py-2 rounded text-sm"
              >
                Fertig
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
npx tsc --noEmit
npx next build
git add src/components/SchnellZugabeSheet.tsx
git commit -m "Schnellzugabe: Sheet mit Zielleiste, Chips und Suche"
```

---

### Task 7: The button

**Files:**
- Create: `src/components/SchnellZugabeFab.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `SchnellZugabeSheet`; `snapshotAktualisieren` from `@/lib/schnellzugabeSnapshot`; `useOnlineStatus`.
- Produces: default export `SchnellZugabeFab()`, taking no props.

- [ ] **Step 1: Write the component**

Create `src/components/SchnellZugabeFab.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { snapshotAktualisieren } from "@/lib/schnellzugabeSnapshot";
import SchnellZugabeSheet from "./SchnellZugabeSheet";

export default function SchnellZugabeFab() {
  const online = useOnlineStatus();
  const [offen, setOffen] = useState(false);

  // Beim Einhaengen einmal vorwaermen, damit auch ohne Besuch der
  // Beobachtungs-Seite ein Snapshot existiert.
  useEffect(() => {
    if (online) void snapshotAktualisieren();
  }, [online]);

  return (
    <>
      <button
        onClick={() => setOffen(true)}
        aria-label="Vogelart schnell hinzufügen"
        className="sm:hidden fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl shadow-lg active:bg-emerald-700 flex items-center justify-center pb-[env(safe-area-inset-bottom)]"
      >
        🐦
      </button>

      {offen && <SchnellZugabeSheet onSchliessen={() => setOffen(false)} />}
    </>
  );
}
```

- [ ] **Step 2: Mount it in the layout**

In `src/app/layout.tsx`, add after the `EasterEgg` import:

```tsx
import SchnellZugabeFab from "@/components/SchnellZugabeFab";
```

and add inside `<body>`, immediately after `<EasterEgg />`:

```tsx
        <SchnellZugabeFab />
```

- [ ] **Step 3: Check it by hand on a mobile viewport**

```bash
npm run dev
```

DevTools → device toolbar → iPhone. Confirm:
1. The button is visible bottom-right on every page and hidden at `sm` and wider.
2. Tapping opens the sheet with the newest observation in the target bar.
3. Tapping a chip marks it ✓ and raises the counter; the remaining chips **do not move**.
4. The target bar opens a list and switching targets recomputes the chips.
5. Searching shows already-recorded species greyed out with "schon erfasst".

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
npx next build
git add src/components/SchnellZugabeFab.tsx src/app/layout.tsx
git commit -m "Schnellzugabe: FAB einhaengen und im Layout einbinden"
```

---

### Task 8: Verify against the database

**Files:**
- Create: `scripts/verify-schnellzugabe.mjs`

**Interfaces:**
- Consumes: `.env.local`.
- Produces: nothing importable. A standalone check.

The UI showing the right thing is not evidence — that is precisely what failed on 2026-07-27. This counts actual rows.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-schnellzugabe.mjs`:

```js
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
```

- [ ] **Step 2: Record the baseline**

```bash
node scripts/verify-schnellzugabe.mjs
```

Note the total and confirm `Doppelte Paare: 0`.

- [ ] **Step 3: Online run**

With the dev server on a mobile viewport, add three species via the FAB to the newest observation. Then:

```bash
node scripts/verify-schnellzugabe.mjs
```

Expected: the total is exactly baseline + 3, duplicates still 0.

- [ ] **Step 4: Offline run**

1. DevTools → Network → **Offline**.
2. Add two more species via the FAB. Confirm chips show 🕓 and `SyncStatus` reports entries waiting.
3. Switch back to **Online** and wait for the automatic sync.

```bash
node scripts/verify-schnellzugabe.mjs
```

Expected: total is baseline + 5, duplicates 0.

- [ ] **Step 5: Confirm repeated sync is safe**

Reload the page so `SyncStatus` runs another sync pass with an empty queue, then:

```bash
node scripts/verify-schnellzugabe.mjs
```

Expected: unchanged from Step 4. Any increase means the queue is not being cleared and is a blocker.

- [ ] **Step 6: Confirm nothing was deleted**

```bash
node scripts/verify-schnellzugabe.mjs 129
```

Observation 129 held 23 species on 2026-07-27 and is untouched by this feature. It must still report 23.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-schnellzugabe.mjs
git commit -m "Schnellzugabe: Pruefskript gegen die Datenbank"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Target = newest observation, always visible | 6 (target bar), 3 (order by `id` desc) |
| Target changeable, last 10 | 6, 3 (`ZIEL_LISTE_LAENGE`) |
| Two taps for the first bird, one for each further | 6 (sheet stays open, counter) |
| Chips ranked by frequency in last 5 observations | 1 |
| Backfill from all-time favourites | 1 |
| Already-recorded hidden from chips | 1 |
| Already-recorded marked in search | 6 |
| Chips filtered at open, no reflow | 6 (`chipBasis` fixed per target) |
| No autofocus on search | 6 |
| New species from search | 4, 6 |
| Snapshot cache | 2, 3 |
| Snapshot written by the FAB itself | 7 |
| Snapshot also refreshed by Beobachtungen page | 5 |
| `artHinzufuegen` hides connectivity | 4 |
| Offline queue, `DB_VERSION` 1→2 | 2 |
| Sync step, additions last | 5 |
| Duplicates: client check + 23505 | 4, 5 |
| Pending count includes additions | 2 |
| FAB on all pages, `sm:hidden` | 7 |
| Empty state when no observation exists | 6 |
| Deleted target handled | 5 (sync skips), 6 (error shown) |
| Verify against the database | 8 |

No gaps.

**Deviations from the spec, deliberate**

1. Snapshot stores `arten: {id, name}[]` instead of parallel `artIds`/`artNamen`. Parallel arrays must stay index-aligned through every transformation; pairs cannot drift.
2. `artHinzufuegen` takes `online` as a parameter rather than reading it internally, keeping the module free of React and `navigator`.
3. `topArten` is capped at 50 entries — enough to backfill 8 chips, and it keeps the IndexedDB record small.

**Type consistency**

`Snapshot`, `SnapshotBeobachtung`, `SnapshotArt`, `TopArt`, `ChipVorschlag`, `ZugabeErgebnis` are declared once in Task 1 and imported everywhere else. `chipsBerechnen`, `artHinzufuegen`, `snapshotAktualisieren`, `snapshotHolen`, `speicherSnapshot`, `ladeSnapshot`, `saveArtNachtrag`, `getArtNachtraege`, `deleteArtNachtrag` keep identical names and signatures across tasks. `ArtNachtrag` is defined in Task 2 and used in Tasks 4 and 5.

**Verification split**

Implementer subagents cannot drive DevTools, so browser-dependent checks are
separated from headless ones:

- **Headless, done by the implementer:** `node` tests (Task 1), the query
  check (Task 3), code-reading confirmations (Task 5), `npx tsc --noEmit`,
  `npx next build`. These gate each task.
- **Browser-dependent, done by the controller after Task 7:** the IndexedDB
  upgrade (Task 2 Step 4), the mobile-viewport walkthrough (Task 7 Step 3),
  and the full online/offline round trip with row verification (Task 8).

A task whose browser check is deferred is still gated by its headless checks;
the deferred item is named in the ledger and closed out in Task 8. No check is
silently dropped.

**Push discipline**

Nothing is pushed until all eight tasks are complete. `master` auto-deploys,
so an intermediate push would put a half-built FAB on the live site.
Implementers commit locally and never run `git push`.
