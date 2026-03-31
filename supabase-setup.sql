-- 1. Vogelarten-Tabelle
CREATE TABLE vogelarten (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- 2. Beobachtungen-Tabelle
CREATE TABLE beobachtungen (
  id SERIAL PRIMARY KEY,
  datum DATE NOT NULL,
  ort TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Verknüpfung: welche Vogelarten bei welcher Beobachtung
CREATE TABLE beobachtung_vogelarten (
  id SERIAL PRIMARY KEY,
  beobachtung_id INTEGER REFERENCES beobachtungen(id) ON DELETE CASCADE,
  vogelart_id INTEGER REFERENCES vogelarten(id) ON DELETE CASCADE
);

-- 4. Fotos-Tabelle
CREATE TABLE fotos (
  id SERIAL PRIMARY KEY,
  beobachtung_id INTEGER REFERENCES beobachtungen(id) ON DELETE CASCADE,
  url TEXT NOT NULL
);

-- 5. Startliste der häufigsten Vogelarten in Deutschland
INSERT INTO vogelarten (name) VALUES
  ('Amsel'), ('Bachstelze'), ('Blaumeise'), ('Blässhuhn'), ('Buchfink'),
  ('Buntspecht'), ('Dohle'), ('Dompfaff (Gimpel)'), ('Eichelhäher'), ('Eisvogel'),
  ('Elster'), ('Erlenzeisig'), ('Feldlerche'), ('Feldsperling'), ('Fitis'),
  ('Gartengrasmücke'), ('Gartenrotschwanz'), ('Gartenbaumläufer'), ('Gebirgsstelze'),
  ('Goldammer'), ('Graugans'), ('Graureiher'), ('Grünfink'), ('Grünspecht'),
  ('Habicht'), ('Haubentaucher'), ('Hausrotschwanz'), ('Haussperling'),
  ('Heckenbraunelle'), ('Höckerschwan'), ('Hohltaube'), ('Kernbeißer'),
  ('Kiebitz'), ('Kleiber'), ('Kleinspecht'), ('Kohlmeise'), ('Kolkrabe'),
  ('Kormoran'), ('Kranich'), ('Kuckuck'), ('Lachmöwe'), ('Mauersegler'),
  ('Mäusebussard'), ('Mehlschwalbe'), ('Misteldrossel'), ('Mönchsgrasmücke'),
  ('Nachtigall'), ('Nebelkrähe'), ('Nilgans'), ('Pirol'), ('Rabenkrähe'),
  ('Rauchschwalbe'), ('Ringeltaube'), ('Rohrammer'), ('Rotdrossel'),
  ('Rotkehlchen'), ('Rotmilan'), ('Saatkrähe'), ('Schwanzmeise'),
  ('Schwarzmilan'), ('Schwarzspecht'), ('Silbermöwe'), ('Singdrossel'),
  ('Sommergoldhähnchen'), ('Sperber'), ('Star'), ('Stieglitz (Distelfink)'),
  ('Stockente'), ('Straßentaube'), ('Sumpfmeise'), ('Tannenmeise'),
  ('Teichhuhn'), ('Turmfalke'), ('Türkentaube'), ('Uhu'),
  ('Wacholderdrossel'), ('Waldbaumläufer'), ('Waldkauz'), ('Waldohreule'),
  ('Wanderfalke'), ('Wasseramsel'), ('Weidenmeise'), ('Weißstorch'),
  ('Wintergoldhähnchen'), ('Zaunkönig'), ('Zilpzalp');

-- 6. Row Level Security aktivieren (für öffentlichen Zugriff ohne Login)
ALTER TABLE vogelarten ENABLE ROW LEVEL SECURITY;
ALTER TABLE beobachtungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE beobachtung_vogelarten ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vogelarten lesen" ON vogelarten FOR SELECT USING (true);
CREATE POLICY "Vogelarten einfügen" ON vogelarten FOR INSERT WITH CHECK (true);
CREATE POLICY "Beobachtungen lesen" ON beobachtungen FOR SELECT USING (true);
CREATE POLICY "Beobachtungen einfügen" ON beobachtungen FOR INSERT WITH CHECK (true);
CREATE POLICY "Beobachtung-Vogelarten lesen" ON beobachtung_vogelarten FOR SELECT USING (true);
CREATE POLICY "Beobachtung-Vogelarten einfügen" ON beobachtung_vogelarten FOR INSERT WITH CHECK (true);
CREATE POLICY "Fotos lesen" ON fotos FOR SELECT USING (true);
CREATE POLICY "Fotos einfügen" ON fotos FOR INSERT WITH CHECK (true);
