-- 0003: autenticação de usuários (cliente web) e contadores de rate limit.

-- Usuários do cliente web. O PIN é armazenado como SHA-256(salt:pin).
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

-- Contadores genéricos para rate limiting e orçamento de IA.
-- `janela` identifica o bucket de tempo: "m:<minuto-epoch>" (minuto) ou "d:<YYYY-MM-DD>" (dia).
CREATE TABLE IF NOT EXISTS contadores (
  chave TEXT NOT NULL,
  janela TEXT NOT NULL,
  contador INTEGER NOT NULL DEFAULT 0 CHECK (contador >= 0),
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (chave, janela)
);