-- Kommentar-Feld für Beobachtungen hinzufügen
ALTER TABLE beobachtungen ADD COLUMN IF NOT EXISTS kommentar TEXT;
