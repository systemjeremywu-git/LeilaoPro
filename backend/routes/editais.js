const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authMiddleware, requirePermissao } = require('../middleware/auth');

const router = express.Router();

// ── MULTER: salva PDFs em /uploads ──
const uploadDir = path.join(__dirname, '../uploads');
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
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// WEBHOOK_URL é lida dinamicamente dentro do handler (não como constante de módulo)
// para garantir que o valor do .env seja sempre usado corretamente.

// ══════════════════════════════════════════════════
//  POST /api/editais/upload
//  Frontend envia o PDF + metadados
// ══════════════════════════════════════════════════
router.post('/upload', authMiddleware, requirePermissao('credenciamento'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo PDF obrigatório.' });

  const { obs } = req.body;

  const uuid = uuidv4();

  // Salva edital no banco com status "processing"
  const result = db.prepare(`
    INSERT INTO editais (uuid, numero, orgao, uf, data_abertura, observacoes, arquivo_nome, arquivo_tamanho, status, usuario_id, usuario_nome)
    VALUES (?, NULL, NULL, NULL, NULL, ?, ?, ?, 'processing', ?, ?)
  `).run(uuid, obs || null, req.file.originalname, req.file.size, req.user.id, req.user.nome);

  const editalId = result.lastInsertRowid;

  // Envia ao n8n via webhook — PDF binário direto no POST
  // Em produção (VPS) o n8n acessa a URL local normalmente
  // Em testes locais o binário é enviado direto para evitar problemas de rede
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_EDITAL_URL || '';
    console.log(`📤 Enviando edital ${uuid} para n8n: ${webhookUrl}`);

    if (!webhookUrl) {
      console.error('⚠️  N8N_WEBHOOK_EDITAL_URL não está configurada no .env!');
    } else {
      const form = new FormData();
      form.append('data', fs.createReadStream(req.file.path), {
        filename: req.file.originalname,
        contentType: 'application/pdf'
      });
      form.append('arquivo_nome', req.file.originalname);
      form.append('uuid', uuid);
      form.append('edital_id', String(editalId));
      form.append('observacoes', obs || '');
      form.append('usuario', req.user.nome);
      form.append('webhook_retorno', `${process.env.BASE_URL}/api/editais/n8n-retorno`);

      await fetch(webhookUrl, { method: 'POST', body: form, headers: form.getHeaders() });
      console.log(`✅ Edital ${uuid} enviado ao n8n com sucesso.`);
    }
  } catch (err) {
    console.error('⚠️  Erro ao enviar para n8n:', err.message);
    // Não falha o request — o edital já foi salvo no banco
  }

  res.status(201).json({
    ok: true,
    id: editalId,
    uuid,
    message: 'Edital enviado para processamento.'
  });
});


// ══════════════════════════════════════════════════
//  POST /api/editais/n8n-retorno
//  n8n chama esta rota ao finalizar o processamento
//  Body esperado: { uuid, titulo_edital, edital_resumo, data_processamento }
// ══════════════════════════════════════════════════
router.post('/n8n-retorno', (req, res) => {
  // Valida chave secreta do n8n (opcional mas recomendado)
  const chave = req.headers['x-n8n-secret'];
  if (process.env.N8N_SECRET && chave !== process.env.N8N_SECRET) {
    return res.status(401).json({ error: 'Chave inválida.' });
  }

  const { uuid, titulo_edital, edital_resumo, numero, orgao } = req.body;
  const data_processamento = new Date().toISOString();
  if (!uuid) return res.status(400).json({ error: 'uuid obrigatório.' });

  const edital = db.prepare('SELECT id FROM editais WHERE uuid = ?').get(uuid);
  if (!edital) return res.status(404).json({ error: 'Edital não encontrado.' });

  db.prepare(`
    UPDATE editais
    SET titulo_edital = ?,
        edital_resumo = ?,
        numero = ?,
        orgao = ?,
        data_processamento = ?,
        status = 'approved'
    WHERE uuid = ?
  `).run(titulo_edital || null, edital_resumo || null, numero || null, orgao || null, data_processamento, uuid);

  console.log(`✅ Retorno n8n recebido para edital UUID: ${uuid}`);
  res.json({ ok: true, uuid });
});

// ══════════════════════════════════════════════════
//  GET /api/editais
//  Lista todos os editais (com filtros opcionais)
// ══════════════════════════════════════════════════
router.get('/', authMiddleware, requirePermissao(['credenciamento', 'contratos']), (req, res) => {
  const { busca, status, uf } = req.query;

  let sql = 'SELECT * FROM editais WHERE 1=1';
  const params = [];

  // Analista, gestor e admin veem todos os editais

  if (busca) {
    sql += ' AND (numero LIKE ? OR orgao LIKE ? OR titulo_edital LIKE ?)';
    const like = `%${busca}%`;
    params.push(like, like, like);
  }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (uf) { sql += ' AND uf = ?'; params.push(uf); }

  sql += ' ORDER BY criado_em DESC';

  const editais = db.prepare(sql).all(...params);
  res.json(editais);
});

// ══════════════════════════════════════════════════
//  GET /api/editais/:id
// ══════════════════════════════════════════════════
router.get('/:id', authMiddleware, requirePermissao(['credenciamento', 'contratos']), (req, res) => {
  const edital = db.prepare('SELECT * FROM editais WHERE id = ?').get(req.params.id);
  if (!edital) return res.status(404).json({ error: 'Edital não encontrado.' });
  res.json(edital);
});

// ══════════════════════════════════════════════════
//  PATCH /api/editais/:id/status
//  Admin altera status manualmente
// ══════════════════════════════════════════════════
router.patch('/:id/status', authMiddleware, (req, res) => {
  if (req.user.perfil !== 'admin' && req.user.perfil !== 'gestor') {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  const { status } = req.body;
  const validos = ['processing', 'approved', 'rejected', 'pending'];
  if (!validos.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

  db.prepare('UPDATE editais SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════
//  DELETE /api/editais/:id
// ══════════════════════════════════════════════════
router.delete('/:id', authMiddleware, (req, res) => {
  const edital = db.prepare('SELECT * FROM editais WHERE id = ?').get(req.params.id);
  if (!edital) return res.status(404).json({ error: 'Não encontrado.' });

  // Só admin ou dono pode excluir
  if (req.user.perfil !== 'admin' && edital.usuario_id !== req.user.id) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }

  // Remove arquivo físico se existir
  try {
    const filePath = path.join(__dirname, '../uploads', edital.arquivo_nome);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { }

  db.prepare('DELETE FROM editais WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── STATS ──
router.get('/stats/resumo', authMiddleware, requirePermissao('credenciamento'), (req, res) => {
  let where = '';
  const params = [];
  // Todos veem as estatísticas totais e gerais

  const total = db.prepare(`SELECT COUNT(*) as n FROM editais ${where}`).get(...params).n;
  const processing = db.prepare(`SELECT COUNT(*) as n FROM editais ${where ? where + ' AND' : 'WHERE'} status='processing'`).get(...params).n;
  const approved = db.prepare(`SELECT COUNT(*) as n FROM editais ${where ? where + ' AND' : 'WHERE'} status='approved'`).get(...params).n;
  const hoje = db.prepare(`SELECT COUNT(*) as n FROM editais ${where ? where + ' AND' : 'WHERE'} date(criado_em)=date('now')`).get(...params).n;

  res.json({ total, processing, approved, hoje });
});

module.exports = router;
