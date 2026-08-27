CREATE TABLE IF NOT EXISTS registros_alimentacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  alimento TEXT NOT NULL,
  quantidade REAL NOT NULL CHECK (quantidade > 0),
  unidade TEXT,
  calorias INTEGER NOT NULL CHECK (calorias >= 0),
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registros_alimentacao_user_data
  ON registros_alimentacao (user_id, data);
