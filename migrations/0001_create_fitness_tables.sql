CREATE TABLE IF NOT EXISTS registros_treino (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  calorias INTEGER NOT NULL CHECK (calorias >= 0),
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_registros_treino_user_data
  ON registros_treino (user_id, data);

CREATE TABLE IF NOT EXISTS metricas_diarias (
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  passos INTEGER NOT NULL DEFAULT 0 CHECK (passos >= 0),
  agua_ml INTEGER NOT NULL DEFAULT 0 CHECK (agua_ml >= 0),
  PRIMARY KEY (user_id, data)
);
