-- 0004: usuários com nome, e-mail único e senha (substitui o modelo usuário+PIN).
-- A tabela é recriada porque a autenticação web ainda não tem usuários reais em produção.
DROP TABLE IF EXISTS usuarios;

CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  senha_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  criado_em TEXT NOT NULL
);