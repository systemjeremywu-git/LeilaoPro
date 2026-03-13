const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
// Ignorar authMiddleware na rota de webhook que vem do n8n
router.use((req, res, next) => {
    if (req.path === '/n8n-retorno') return next();
    return authMiddleware(req, res, next);
});

// ── MULTER para PDF do contrato ──
const uploadDir = path.join(__dirname, '../uploads/contratos');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, safe);
    }
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') cb(null, true);
        else cb(new Error('Apenas PDF é aceito.'));
    },
    limits: { fileSize: 100 * 1024 * 1024 }
});

// ══════════════════════════════════════════
//  GET /api/contratos — lista com filtros
// ══════════════════════════════════════════
router.get('/', (req, res) => {
    const { busca, status, leiloeiro_id } = req.query;

    let sql = `
    SELECT c.*,
           e.numero  AS edital_numero,
           e.orgao   AS edital_orgao,
           e.uf      AS edital_uf,
           l.nome    AS leiloeiro_nome,
           m.uf      AS matricula_uf,
           m.numero_matricula AS matricula_numero,
           m.junta   AS matricula_junta,
           c.titulo_contrato
    FROM contratos c
    LEFT JOIN editais e ON e.id = c.edital_credenciamento_id
    LEFT JOIN leiloeiros l ON l.id = c.leiloeiro_id
    LEFT JOIN leiloeiro_matriculas m ON m.id = c.matricula_id
    WHERE 1=1
  `;
    const params = [];

    if (busca) {
        sql += ' AND (c.edital_leiloeiro_ref LIKE ? OR l.nome LIKE ? OR e.numero LIKE ?)';
        const like = `%${busca}%`;
        params.push(like, like, like);
    }
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (leiloeiro_id) { sql += ' AND c.leiloeiro_id = ?'; params.push(leiloeiro_id); }

    sql += ' ORDER BY c.criado_em DESC';

    res.json(db.prepare(sql).all(...params));
});

// ══════════════════════════════════════════
//  GET /api/contratos/stats/resumo
// ══════════════════════════════════════════
router.get('/stats/resumo', (req, res) => {
    const total = db.prepare("SELECT COUNT(*) as n FROM contratos").get().n;
    const em_execucao = db.prepare("SELECT COUNT(*) as n FROM contratos WHERE status='em_execucao'").get().n;
    const encerrado = db.prepare("SELECT COUNT(*) as n FROM contratos WHERE status='encerrado'").get().n;
    const suspenso = db.prepare("SELECT COUNT(*) as n FROM contratos WHERE status='suspenso'").get().n;
    res.json({ total, em_execucao, encerrado, suspenso });
});

// ══════════════════════════════════════════
//  GET /api/contratos/:id — detalhe
// ══════════════════════════════════════════
router.get('/:id', (req, res) => {
    const contrato = db.prepare(`
    SELECT c.*,
           e.numero  AS edital_numero,
           e.orgao   AS edital_orgao,
           e.uf      AS edital_uf,
           e.titulo_edital,
           l.nome    AS leiloeiro_nome,
           l.cpf     AS leiloeiro_cpf,
           m.uf      AS matricula_uf,
           m.numero_matricula,
           m.junta   AS matricula_junta
    FROM contratos c
    LEFT JOIN editais e ON e.id = c.edital_credenciamento_id
    LEFT JOIN leiloeiros l ON l.id = c.leiloeiro_id
    LEFT JOIN leiloeiro_matriculas m ON m.id = c.matricula_id
    WHERE c.id = ?
  `).get(req.params.id);

    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado.' });
    res.json(contrato);
});

// ══════════════════════════════════════════
//  POST /api/contratos — cria novo e envia p/ n8n
// ══════════════════════════════════════════
router.post('/', upload.single('arquivo'), (req, res) => {
    const {
        edital_credenciamento_id,
        leiloeiro_id, matricula_id,
        observacoes
    } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'É obrigatório enviar o PDF do contrato.' });
    }

    const uuid = uuidv4();
    const result = db.prepare(`
    INSERT INTO contratos (
      uuid, edital_credenciamento_id, edital_leiloeiro_ref,
      leiloeiro_id, matricula_id,
      arquivo_nome, arquivo_tamanho,
       observacoes, status, usuario_id, usuario_nome
    ) VALUES (?,?,?,?,?,?,?,?,'em_execucao',?,?)
  `).run(
        uuid, edital_credenciamento_id || null, null,
        leiloeiro_id || null, matricula_id || null,
        req.file.originalname,
        req.file.size,
        observacoes || null,
        req.user.id, req.user.nome
    );

    const contratoId = result.lastInsertRowid;

    // Dispara envio p/ n8n em background
    try {
        const webhookUrl = process.env.N8N_WEBHOOK_CONTRATO_URL || '';
        console.log(`📤 Enviando contrato ${uuid} para n8n: ${webhookUrl}`);

        if (!webhookUrl) {
            console.error('⚠️  N8N_WEBHOOK_CONTRATO_URL não está configurada no .env!');
        } else {
            const form = new FormData();
            form.append('data', fs.createReadStream(req.file.path), {
                filename: req.file.originalname,
                contentType: 'application/pdf'
            });
            form.append('arquivo_nome', req.file.originalname);
            form.append('uuid', uuid);
            form.append('contrato_id', String(contratoId));

            fetch(webhookUrl, { method: 'POST', body: form })
                .then(r => console.log(`✅ Contrato ${uuid} enviado, status: ${r.status}`))
                .catch(e => console.error(`❌ Erro n8n contrato ${uuid}:`, e.message));
        }
    } catch (err) {
        console.error('Erro geral extra n8n', err);
    }

    res.status(201).json({
        ok: true,
        id: contratoId,
        uuid,
        message: 'Contrato enviado para processamento.'
    });
});

// ══════════════════════════════════════════
//  POST /api/contratos/n8n-retorno
//  n8n chama esta rota ao finalizar o processamento
// ══════════════════════════════════════════
router.post('/n8n-retorno', (req, res) => {
    const chave = req.headers['x-n8n-secret'];
    if (process.env.N8N_SECRET && chave !== process.env.N8N_SECRET) {
        return res.status(401).json({ error: 'Chave inválida.' });
    }

    const { uuid, contrato_resumo, titulo_contrato } = req.body;
    const data_processamento = new Date().toISOString();
    if (!uuid) return res.status(400).json({ error: 'uuid obrigatório.' });

    const contrato = db.prepare('SELECT id FROM contratos WHERE uuid = ?').get(uuid);
    if (!contrato) return res.status(404).json({ error: 'Contrato não encontrado.' });

    db.prepare(`
    UPDATE contratos
    SET contrato_resumo = ?,
        titulo_contrato = ?,
        data_processamento = ?
    WHERE uuid = ?
  `).run(contrato_resumo || null, titulo_contrato || null, data_processamento, uuid);

    console.log(`✅ Retorno n8n recebido para contrato UUID: ${uuid}`);
    res.json({ ok: true, uuid });
});

// ══════════════════════════════════════════
//  PATCH /api/contratos/:id/status
// ══════════════════════════════════════════
router.patch('/:id/status', (req, res) => {
    if (req.user.perfil !== 'admin' && req.user.perfil !== 'gestor') {
        return res.status(403).json({ error: 'Sem permissão.' });
    }
    const { status } = req.body;
    const validos = ['em_execucao', 'encerrado', 'suspenso'];
    if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

    db.prepare('UPDATE contratos SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
});

// ══════════════════════════════════════════
//  DELETE /api/contratos/:id
// ══════════════════════════════════════════
router.delete('/:id', (req, res) => {
    if (req.user.perfil !== 'admin') {
        return res.status(403).json({ error: 'Sem permissão.' });
    }
    const contrato = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    if (!contrato) return res.status(404).json({ error: 'Não encontrado.' });

    // Remove arquivo físico se existir
    if (contrato.arquivo_nome) {
        try {
            const fp = path.join(uploadDir, contrato.arquivo_nome);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        } catch { }
    }

    db.prepare('DELETE FROM contratos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ══════════════════════════════════════════
//  PUT /api/contratos/:id
// ══════════════════════════════════════════
router.put('/:id', (req, res) => {
    // Permite que qualquer usuário com acesso ao módulo (validado pelo router.use) possa editar esses metadados
    const { edital_leiloeiro_ref, observacoes } = req.body;
    db.prepare('UPDATE contratos SET edital_leiloeiro_ref = ?, observacoes = ? WHERE id = ?')
      .run(edital_leiloeiro_ref || null, observacoes || null, req.params.id);

    res.json({ ok: true });
});

module.exports = router;
