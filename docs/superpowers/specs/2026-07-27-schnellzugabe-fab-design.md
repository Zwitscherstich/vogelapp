# Schnellzugabe — Floating Action Button für schnelles Erfassen

**Datum:** 2026-07-27
**Status:** Design freigegeben, Implementierung ausstehend

## Problem

Das Erfassen einer Vogelart erfordert derzeit: Navigation zu „Neue Beobachtung", Datum/Ort ausfüllen, Art suchen, speichern. Für den häufigsten mobilen Fall — „ich sehe gerade einen Vogel, den will ich schnell festhalten" — ist das zu viel.

Der Nutzer steht draußen, hält ein Fernglas, hat oft kein Netz und will in ein bis zwei Taps fertig sein.

## Ziel

Ein Floating Action Button, über den eine Vogelart mit **zwei Taps** an eine bestehende Beobachtung angehängt wird — **ein Tap** für jede weitere Art in derselben Sitzung. Funktioniert offline.

## Nicht-Ziele

- Kein Ersatz für das vollständige Formular (Fotos, Kommentar, Datum/Ort bearbeiten bleiben dort)
- Keine GPS- oder Tageszeit-basierte Vorschläge: rateanfällig, erfordert eine Berechtigungsabfrage, und die Häufigkeits-Rangfolge erfasst den Ort bereits implizit
- Kein Anlegen einer neuen Beobachtung aus dem Sheet heraus (Ort-Eingabe würde den Zwei-Tap-Fluss zerstören)

## Interaktion

### Zielbeobachtung

Standardziel ist immer die **neueste Beobachtung** (höchste `id`) — unabhängig vom Datum. Bewusst keine Datumslogik: stattdessen wird das Ziel **immer sichtbar** oben im Sheet angezeigt, inklusive Ort und Datum, und ist antippbar zum Wechseln.

Transparenz statt Heuristik. Der Nutzer sieht sofort, wohin die Art wandert, statt sich auf eine Regel verlassen zu müssen, die er nicht sieht.

Beim Antippen der Zielleiste öffnet sich eine Liste der letzten 10 Beobachtungen (Ort, Datum, Artenzahl). Auswahl wechselt das Ziel; die Chips werden neu berechnet.

### Ablauf

```
┌─────────────────────────────┐
│ → Garten, heute      [▾]    │  ← Ziel, antippbar
├─────────────────────────────┤
│ 🔍 Suchen…                  │
├─────────────────────────────┤
│ [Amsel]  [Kohlmeise]        │
│ [Rotkehlchen] [Buchfink]    │  ← 2. Tap = fertig
│ [Elster]  [Star]  [Specht]  │
├─────────────────────────────┤
│ 2 hinzugefügt      [Fertig] │
└─────────────────────────────┘
```

- **Tap 1:** FAB öffnet das Sheet
- **Tap 2:** Chip antippen → Art wird geschrieben, Chip wird zu „✓ Amsel" (gedimmt)
- **Jeder weitere Tap:** eine weitere Art

Das Sheet bleibt nach dem Hinzufügen offen (Burst-Modus). Vogelbeobachtung ist stoßweise — eine Hecke liefert vier Arten in dreißig Sekunden. Schließen über „Fertig", Wischen nach unten oder Tap auf den Hintergrund.

Das Suchfeld erhält **keinen** Autofokus: eine aufspringende Tastatur würde die Chips verdecken und damit den Zwei-Tap-Fall zugunsten des selteneren Suchfalls opfern.

### Bereits erfasste Arten

Zwei bewusst unterschiedliche Regeln:

- **Chips:** Arten, die die Zielbeobachtung bereits enthält, werden **nicht angezeigt**. Chip-Fläche ist knapp und soll nur Handlungsmöglichkeiten zeigen.
- **Suchliste:** Solche Arten werden **angezeigt und markiert** („✓ schon erfasst", nicht antippbar). Wer gezielt sucht, will eine Antwort — nicht ein stilles Fehlen.

**Chips werden beim Öffnen des Sheets gefiltert, nicht laufend.** Ein angetippter Chip behält seine Position, wird gedimmt und mit ✓ markiert. Würden Chips sofort verschwinden, würde die Reihe unter dem Daumen umbrechen und der nächste Tap träfe die falsche Art. Erst beim nächsten Öffnen ist der Chip weg.

### Rangfolge der Chips

Häufigkeit innerhalb eines Fensters der letzten **5 Beobachtungen**:

1. Arten der letzten 5 Beobachtungen sammeln, nach Anzahl der Vorkommen absteigend sortieren
2. Bereits in der Zielbeobachtung enthaltene Arten entfernen
3. Auf 8 Chips auffüllen mit den insgesamt häufigsten Arten aller Zeiten, die noch nicht in der Liste sind
4. Gleichstand: nach Gesamthäufigkeit, dann alphabetisch

Ein Fenster über **Beobachtungen** statt über Tage ist bewusst gewählt: „letzte 3 Tage" liefert nach einer Woche Pause null Chips — genau dann, wenn die App für eine neue Sitzung geöffnet wird. Ein Beobachtungsfenster ist nie leer und passt sich selbst an (auf einer Reise sind die letzten 5 Beobachtungen die Reise).

Fenstergröße (5), Chip-Anzahl (8) und Ziel-Listenlänge (10) sind Konstanten an einer Stelle, damit sie nach echter Nutzung justierbar sind.

### Neue Vogelart

Findet die Suche nichts, erscheint wie im Hauptformular „+ ‚X' als neue Vogelart hinzufügen". Online wird die Art angelegt und sofort verknüpft; offline wird sie als Name in die Warteschlange gelegt und beim Sync aufgelöst.

## Architektur

### 1. Snapshot-Cache (neu)

`beobachtungen` und `beobachtung_vogelarten` liegen bisher nicht offline vor — nur `vogelarten`. Ohne sie kennt das Sheet offline weder die neueste Beobachtung noch eine Rangfolge.

Neuer IndexedDB-Store `schnellzugabeSnapshot` mit einem einzigen Eintrag:

```ts
interface Snapshot {
  id: "aktuell";
  erstelltAm: string;
  beobachtungen: {
    id: number;
    datum: string;
    ort: string;
    land: string;
    artIds: number[];
    artNamen: string[];
  }[];            // die letzten 10, neueste zuerst
  topArten: { id: number; name: string; anzahl: number }[]; // Gesamthäufigkeit, für Auffüllung
}
```

Geschrieben wird der Snapshot **von der FAB-Komponente selbst**: einmal beim Einhängen (online) und erneut beim Öffnen des Sheets, sofern der letzte Stand älter als eine Minute ist. Bewusst nicht an das Laden der Beobachtungs-Seite gekoppelt — der FAB liegt auf allen Seiten, und wer nie zu `/beobachtungen` navigiert, hätte sonst nie einen Snapshot.

Die Beobachtungs-Seite aktualisiert den Snapshot zusätzlich beiläufig, da sie die nötigen Daten ohnehin lädt.

Höchstens einen Seitenbesuch veraltet — für eine Vorschlagsliste unkritisch. Die Zielleiste zeigt bei Offline-Nutzung einen dezenten Hinweis, dass der Stand zwischengespeichert ist.

### 2. Datenschicht: `src/lib/schnellzugabe.ts`

Eine Funktion kapselt den Schreibpfad, damit die Komponente nie auf Konnektivität verzweigt:

```ts
type Ergebnis =
  | { status: "hinzugefuegt" }
  | { status: "vorhanden" }      // war schon verknüpft
  | { status: "wartet" }         // offline eingereiht
  | { status: "fehler"; meldung: string };

async function artHinzufuegen(
  beobachtungId: number,
  art: { id: number } | { neuerName: string }
): Promise<Ergebnis>;
```

- **Online:** ggf. Art anlegen, dann Verknüpfung einfügen
- **Offline:** in `offlineArtNachtraege` einreihen (`DB_VERSION` 1 → 2)

### 3. Offline-Warteschlange

Neuer Store `offlineArtNachtraege`:

```ts
interface ArtNachtrag {
  tempId?: number;
  beobachtungId: number;
  vogelartId?: number;
  neuerName?: string;
}
```

`syncOfflineData` erhält einen dritten Schritt, der die Warteschlange leert. Reihenfolge: bestehende Vogelarten → bestehende Beobachtungen → **danach** Nachträge, damit Nachträge auf zwischenzeitlich synchronisierte Beobachtungen zutreffen können.

Vor jedem Insert wird geprüft, ob die Verknüpfung bereits existiert; `neuerName` wird wie in `sync.ts` etabliert erst gegen vorhandene Arten geprüft, bevor eine neue angelegt wird. Ein doppelter Sync darf keine Duplikate erzeugen — unabhängig davon, ob die Datenbank einen Unique-Constraint besitzt.

### 4. Komponenten

- **`SchnellZugabeFab.tsx`** — Button plus Sheet-State. Einmal in `layout.tsx` eingehängt, damit er auf allen Seiten verfügbar ist. `sm:hidden`; am Desktop ist das vollständige Formular ohnehin bequem erreichbar. Positioniert unten rechts mit Abstand zur Navigation.
- **`SchnellZugabeSheet.tsx`** — Zielleiste, Suche, Chips, Burst-Zähler.

Bewusst **keine** Wiederverwendung von `BeobachtungFormular`: die Komponente umfasst bereits ~480 Zeilen und trägt Entwurfs-, Ort-Autocomplete- und Tastatur-Navigationslogik, die hier nicht gebraucht wird. Eine gemeinsame Basis würde beide Seiten verflechten; ~200 fokussierte Zeilen sind die sauberere Grenze.

## Randfälle

| Fall | Verhalten |
|---|---|
| Keine Beobachtung vorhanden | Sheet zeigt „Noch keine Beobachtung" + Button zu `/`. FAB bleibt sichtbar. |
| Offline, nie online gewesen (kein Snapshot) | Gleicher Zustand wie oben, mit Hinweis auf fehlende Daten. |
| Zielbeobachtung zwischenzeitlich gelöscht | Schreiben schlägt fehl → Meldung, Snapshot wird neu geladen, Ziel fällt auf die dann neueste Beobachtung zurück. |
| Art doppelt angetippt | Client-seitige Prüfung; Unique-Verletzung der DB wird als Erfolg gewertet, nicht als Fehler. |
| Art bereits vorhanden | `{ status: "vorhanden" }`, Chip zeigt „schon erfasst". |
| Offline eingereiht | Chip zeigt ✓ mit Uhr-Symbol; `SyncStatus` zählt die Nachträge mit. |

## Tests

Kein Test-Framework im Projekt. Verifiziert wird über:

1. **Rangfolge als reine Funktion** — `chipsBerechnen(snapshot, zielId)` ist seiteneffektfrei und wird mit einem Skript gegen echte Snapshot-Daten geprüft: Fenster leer, Ziel enthält alle Top-Arten, weniger als 8 Kandidaten, Gleichstand.
2. **Offline-Runde** — DevTools offline, drei Arten einreihen, online schalten, Sync prüfen: alle drei verknüpft, keine Duplikate.
3. **Doppelter Sync** — `syncOfflineData` zweimal ausführen; Zeilenzahl muss identisch bleiben.
4. **Zählung gegen die Datenbank** — nach jedem Durchlauf via PostgREST prüfen, dass die Artenzahl der Zielbeobachtung exakt um die hinzugefügten Arten steigt.

Punkt 4 ist nach dem Datenverlust-Bug dieser Session nicht verhandelbar: jeder neue Schreibpfad wird gegen die tatsächlichen Zeilen in der Datenbank verifiziert, nicht gegen die Anzeige.

## Reihenfolge der Umsetzung

1. Snapshot-Store + Schreiben beim Laden der Beobachtungs-Seite
2. `chipsBerechnen` als reine Funktion + Prüfskript
3. `artHinzufuegen` (nur online) + Warteschlangen-Store
4. Sheet und FAB gegen die fertige Datenschicht
5. Offline-Warteschlange + Sync-Schritt
6. Vollständiger Offline-Durchlauf und Verifikation gegen die Datenbank
