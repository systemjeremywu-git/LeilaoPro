-- Migration inicial: Criacao das tabelas base

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT NOT NULL,
    permissoes TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note: No SQLite, o backend ja cria as tabelas automaticamente via database.js
-- Este arquivo serve como registro historico e para futuras alteracoes estruturais.
