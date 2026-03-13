const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/leilaopro.db');

const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── CRIAÇÃO DAS TABELAS ──
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil     TEXT NOT NULL DEFAULT 'analista',
    permissoes TEXT NOT NULL DEFAULT 'credenciamento',
    ativo      INTEGER NOT NULL DEFAULT 1,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS editais (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid               TEXT NOT NULL UNIQUE,
    numero             TEXT,
    orgao              TEXT,
    uf                 TEXT,
    data_abertura      TEXT,
    observacoes        TEXT,
    arquivo_nome       TEXT,
    arquivo_tamanho    INTEGER,
    titulo_edital      TEXT,
    edital_resumo      TEXT,
    data_processamento TEXT,
    status             TEXT NOT NULL DEFAULT 'processing',
    usuario_id         INTEGER NOT NULL,
    usuario_nome       TEXT NOT NULL,
    criado_em          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS leiloeiros (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    cpf       TEXT,
    email     TEXT,
    telefone  TEXT,
    ativo     INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leiloeiro_matriculas (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    leiloeiro_id      INTEGER NOT NULL,
    uf                TEXT NOT NULL,
    numero_matricula  TEXT NOT NULL,
    junta             TEXT,
    logradouro        TEXT,
    numero            TEXT,
    complemento       TEXT,
    cidade            TEXT,
    estado            TEXT,
    cep               TEXT,
    rg                TEXT,
    rg_data_expedicao TEXT,
    ativo             INTEGER NOT NULL DEFAULT 1,
    criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (leiloeiro_id) REFERENCES leiloeiros(id)
  );

  CREATE TABLE IF NOT EXISTS contratos (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid                     TEXT NOT NULL UNIQUE,
    edital_credenciamento_id INTEGER,
    edital_leiloeiro_ref     TEXT,
    leiloeiro_id             INTEGER,
    matricula_id             INTEGER,
    arquivo_nome             TEXT,
    arquivo_tamanho          INTEGER,
    observacoes              TEXT,
    contrato_resumo          TEXT,
    data_processamento       TEXT,
    status                   TEXT NOT NULL DEFAULT 'em_execucao',
    usuario_id               INTEGER NOT NULL,
    usuario_nome             TEXT NOT NULL,
    criado_em                TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (edital_credenciamento_id) REFERENCES editais(id),
    FOREIGN KEY (leiloeiro_id) REFERENCES leiloeiros(id),
    FOREIGN KEY (matricula_id) REFERENCES leiloeiro_matriculas(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    token      TEXT NOT NULL UNIQUE,
    expira_em  TEXT NOT NULL,
    usado      INTEGER NOT NULL DEFAULT 0,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo       TEXT NOT NULL,
    descricao  TEXT,
    usuario_id INTEGER,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── SEED: cria admin padrão se não existir ──
const adminExiste = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('admin@leilaopro.com');
if (!adminExiste) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, permissoes)
    VALUES (?, ?, ?, 'admin', 'credenciamento,contratos,leiloeiros,avaliacao')
  `).run('Administrador', 'admin@leilaopro.com', hash);

  const hash2 = bcrypt.hashSync('123456', 10);
  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, permissoes)
    VALUES (?, ?, ?, 'analista', 'credenciamento,contratos,avaliacao')
  `).run('Ana Analista', 'ana@leilaopro.com', hash2);

  db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, permissoes)
    VALUES (?, ?, ?, 'gestor', 'credenciamento,contratos,avaliacao')
  `).run('Carlos Gestor', 'carlos@leilaopro.com', hash2);

  console.log('✅ Usuários padrão criados.');
}

module.exports = db;
