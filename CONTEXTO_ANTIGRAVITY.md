# CONTEXTO DO PROJETO — LeilãoPro

## O que é este sistema
SaaS de **credenciamento de leiloeiros** com controle de acesso por usuário, módulos por setor e integração com n8n para processamento automático de editais em PDF.

---

## Stack técnica
- **Backend:** Node.js + Express
- **Banco de dados:** SQLite (via `better-sqlite3`) — arquivo em `backend/data/leilaopro.db`
- **Autenticação:** JWT com bcryptjs — token expira em 8h
- **Upload de arquivos:** Multer — PDFs salvos em `backend/uploads/`
- **Frontend:** HTML/CSS/JS puro em `frontend/index.html` — servido pelo próprio Express
- **Hospedagem:** VPS Linux com PM2

---

## Estrutura de pastas
```
leilaopro/
├── backend/
│   ├── db/database.js         # Criação das tabelas SQLite + seed de usuários
│   ├── middleware/auth.js     # JWT, requireAdmin, requirePermissao(modulo)
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login | GET /api/auth/me
│   │   ├── usuarios.js        # CRUD /api/usuarios (só admin)
│   │   └── editais.js         # Upload, lista, retorno n8n, stats
│   ├── server.js              # Entry point Express
│   ├── .env                   # Variáveis de ambiente (não commitar)
│   └── package.json
└── frontend/
    └── index.html             # SPA completo (auth + sidebar + páginas)
```

---

## Banco de dados — Tabelas SQLite

### `usuarios`
| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK | Auto increment |
| nome | TEXT | Nome completo |
| email | TEXT UNIQUE | Login |
| senha_hash | TEXT | bcrypt hash |
| perfil | TEXT | `admin`, `gestor`, `analista` |
| permissoes | TEXT | Lista separada por vírgula: `credenciamento,contratos,veiculos` |
| ativo | INTEGER | 1 = ativo, 0 = desativado |
| criado_em | TEXT | datetime ISO |

### `editais`
| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK | Auto increment |
| uuid | TEXT UNIQUE | ID único gerado no upload (vincula com n8n) |
| numero | TEXT | Nº do edital ex: 001/2025 |
| orgao | TEXT | Órgão/entidade |
| uf | TEXT | Estado |
| data_abertura | TEXT | Data da licitação |
| observacoes | TEXT | Texto livre |
| arquivo_nome | TEXT | Nome original do PDF |
| arquivo_tamanho | INTEGER | Tamanho em bytes |
| titulo_edital | TEXT | **Preenchido pelo retorno do n8n** |
| edital_resumo | TEXT | **Preenchido pelo retorno do n8n** |
| data_processamento | TEXT | **Preenchido pelo retorno do n8n** |
| status | TEXT | `processing`, `approved`, `rejected`, `pending` |
| usuario_id | INTEGER FK | Quem enviou |
| usuario_nome | TEXT | Nome snapshot |
| criado_em | TEXT | datetime ISO |

### `logs`
| Campo | Tipo | Descrição |
|---|---|---|
| id | INTEGER PK | Auto increment |
| tipo | TEXT | Ex: `login`, `upload` |
| descricao | TEXT | Detalhes |
| usuario_id | INTEGER | Quem fez |
| criado_em | TEXT | datetime ISO |

---

## API — Endpoints

### Auth
- `POST /api/auth/login` — body: `{ email, senha }` → retorna `{ token, user }`
- `GET  /api/auth/me` — header: `Authorization: Bearer TOKEN` → retorna dados do usuário

### Usuários (requer admin)
- `GET    /api/usuarios` — lista todos
- `POST   /api/usuarios` — cria: `{ nome, email, senha, perfil, permissoes[] }`
- `PUT    /api/usuarios/:id` — edita
- `DELETE /api/usuarios/:id` — desativa (soft delete)

### Editais
- `POST  /api/editais/upload` — multipart/form-data: `file + numero + orgao + uf + dataAbertura + obs`
- `GET   /api/editais` — lista com filtros: `?busca=&status=&uf=`
- `GET   /api/editais/stats/resumo` — retorna `{ total, processing, approved, hoje }`
- `GET   /api/editais/:id` — detalhe
- `PATCH /api/editais/:id/status` — body: `{ status }` — gestor/admin
- `DELETE /api/editais/:id` — admin ou dono
- `POST  /api/editais/n8n-retorno` — **chamado pelo n8n** com `{ uuid, titulo_edital, edital_resumo, data_processamento }`

---

## Fluxo de integração com n8n

```
Frontend
  → POST /api/editais/upload (PDF + metadados)
  → Backend salva edital com status "processing" e uuid único
  → Backend envia PDF + uuid para webhook Ummense
  → n8n recebe, converte PDF em texto, extrai dados com IA
  → n8n faz POST /api/editais/n8n-retorno com { uuid, titulo_edital, edital_resumo, data_processamento }
  → Backend atualiza edital: preenche título, resumo e muda status para "approved"
  → Frontend faz polling a cada 15s e atualiza a lista automaticamente
```

**Webhook de envio:** `https://app.ummense.com/incoming-webhook/1c9ca063-2b7d-4691-b747-57667cd0fa22`

**Header de segurança do n8n:** `x-n8n-secret: valor_definido_no_.env`

---

## Perfis de usuário e permissões

| Perfil | O que pode |
|---|---|
| `admin` | Tudo: criar usuários, ver todos os editais, alterar qualquer status |
| `gestor` | Ver todos os editais, alterar status, não gerencia usuários |
| `analista` | Vê só os próprios editais, não altera status |

Permissões por módulo são independentes do perfil — um analista pode ter acesso a Credenciamento mas não a Contratos.

---

## Frontend — Páginas e componentes

- **Login:** tela de autenticação com JWT persistido no `localStorage`
- **Sidebar:** navegação com itens travados por permissão
- **Credenciamento:** 2 abas — "Enviar Edital" (upload + form) e "Lista de Editais" (tabela com busca)
- **Contratos:** módulo em desenvolvimento (placeholder)
- **Veículos:** módulo em desenvolvimento (placeholder)
- **Usuários:** gestão de usuários (só admin) — cards com chips de permissão

**Padrão visual:** minimalista, DM Sans + DM Mono, tons neutros, sem bibliotecas externas.

---

## Variáveis de ambiente (.env)
```env
PORT=3000
BASE_URL=http://SEU_IP:3000
FRONTEND_URL=http://SEU_IP:3000
JWT_SECRET=string_aleatoria_longa
N8N_SECRET=chave_secreta_compartilhada_com_n8n
```

---

## Módulos planejados (ainda não implementados)
- **Contratos:** gestão de contratos dos leiloeiros credenciados
- **Veículos:** cadastro e controle de veículos para leilão
- **Relatórios:** exportação de editais analisados em PDF/Excel
- **Notificações:** alertas quando o n8n finalizar processamento

---

## Convenções de código
- Rotas Express em `backend/routes/` — um arquivo por módulo
- Middleware de auth sempre importado de `backend/middleware/auth.js`
- Banco de dados importado de `backend/db/database.js` — instância única (singleton)
- Frontend em arquivo único `frontend/index.html` — sem frameworks, sem build step
- Todas as datas salvas em ISO 8601, exibidas em `dd/MM/yyyy HH:mm`
- Senhas sempre hasheadas com bcrypt (salt 10)
- Soft delete em usuários (campo `ativo = 0`), hard delete em editais
