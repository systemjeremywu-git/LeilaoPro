const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db/database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/usuarios
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, nome, email, perfil, permissoes, ativo, criado_em FROM usuarios ORDER BY nome
  `).all();
  res.json(users.map(u => ({ ...u, permissoes: u.permissoes.split(',') })));
});

// POST /api/usuarios
router.post('/', requireAdmin, (req, res) => {
  const { nome, email, senha, perfil, permissoes } = req.body;
  if (!nome || !email || !senha || !perfil) return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha, perfil.' });

  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.trim().toLowerCase());
  if (existe) return res.status(409).json({ error: 'E-mail já cadastrado.' });

  const hash = bcrypt.hashSync(senha, 10);
  const permsStr = Array.isArray(permissoes) ? permissoes.join(',') : (permissoes || 'credenciamento');

  const result = db.prepare(`
    INSERT INTO usuarios (nome, email, senha_hash, perfil, permissoes) VALUES (?, ?, ?, ?, ?)
  `).run(nome, email.trim().toLowerCase(), hash, perfil, permsStr);

  res.status(201).json({ id: result.lastInsertRowid, nome, email, perfil, permissoes: permsStr.split(',') });
});

// PUT /api/usuarios/:id
router.put('/:id', requireAdmin, (req, res) => {
  const { nome, email, senha, perfil, permissoes, ativo } = req.body;
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const permsStr = Array.isArray(permissoes) ? permissoes.join(',') : (permissoes || user.permissoes);
  const novoHash = senha ? bcrypt.hashSync(senha, 10) : user.senha_hash;

  db.prepare(`
    UPDATE usuarios SET nome=?, email=?, senha_hash=?, perfil=?, permissoes=?, ativo=? WHERE id=?
  `).run(
    nome || user.nome,
    email || user.email,
    novoHash,
    perfil || user.perfil,
    permsStr,
    ativo !== undefined ? ativo : user.ativo,
    id
  );

  res.json({ ok: true });
});

// DELETE /api/usuarios/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Não é possível excluir seu próprio usuário.' });
  db.prepare('UPDATE usuarios SET ativo = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
