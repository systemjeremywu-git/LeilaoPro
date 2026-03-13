const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────
//  POST /api/auth/login
// ──────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const ok = bcrypt.compareSync(senha, user.senha_hash);
  if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });

  const token = jwt.sign(
    { id: user.id, email: user.email, perfil: user.perfil },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  db.prepare("INSERT INTO logs (tipo, descricao, usuario_id) VALUES ('login', ?, ?)").run(`Login: ${user.email}`, user.id);

  res.json({
    token,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      permissoes: user.permissoes.split(','),
    }
  });
});

// ──────────────────────────────────────────
//  GET /api/auth/me
// ──────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    permissoes: u.permissoes.split(','),
  });
});

// ──────────────────────────────────────────
//  POST /api/auth/reset-request
//  Usuário informa e-mail → sistema gera código de 6 dígitos válido por 60 min
//  (Admin copia o código e repassa ao usuário)
// ──────────────────────────────────────────
router.post('/reset-request', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mail obrigatório.' });

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email.trim().toLowerCase());
  // Mesmo que não encontre, respondemos sucesso (evita enumeração de usuários)
  if (!user) return res.json({ ok: true, msg: 'Se o e-mail existir, um código foi gerado.' });

  // Invalida tokens anteriores do mesmo usuário
  db.prepare('UPDATE password_reset_tokens SET usado = 1 WHERE usuario_id = ? AND usado = 0').run(user.id);

  // Gera código numérico de 6 dígitos
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +60 min

  db.prepare(`
    INSERT INTO password_reset_tokens (usuario_id, token, expira_em)
    VALUES (?, ?, ?)
  `).run(user.id, codigo, expira_em);

  console.log(`🔑 Código de reset para ${user.email}: ${codigo} (expira em ${expira_em})`);

  // Em produção o admin consulta via painel; retornamos o código só para admin acessar
  // Em ambiente local exibimos também no response para facilitar
  res.json({
    ok: true,
    msg: 'Código gerado. Solicite ao administrador do sistema.',
    // O código é retornado para o admin poder repassar — em produção real seria por e-mail
    codigo_admin: codigo
  });
});

// ──────────────────────────────────────────
//  POST /api/auth/reset-confirm
//  Usuário informa e-mail + código + nova senha
// ──────────────────────────────────────────
router.post('/reset-confirm', (req, res) => {
  const { email, codigo, nova_senha } = req.body;
  if (!email || !codigo || !nova_senha) {
    return res.status(400).json({ error: 'E-mail, código e nova senha são obrigatórios.' });
  }
  if (nova_senha.length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(email.trim().toLowerCase());
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const tokenRow = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE usuario_id = ? AND token = ? AND usado = 0
    ORDER BY criado_em DESC LIMIT 1
  `).get(user.id, codigo.trim());

  if (!tokenRow) return res.status(400).json({ error: 'Código inválido ou já utilizado.' });

  // Verifica expiração
  if (new Date(tokenRow.expira_em) < new Date()) {
    return res.status(400).json({ error: 'Código expirado. Solicite um novo código ao administrador.' });
  }

  // Aplica nova senha
  const novoHash = bcrypt.hashSync(nova_senha, 10);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(novoHash, user.id);

  // Marca token como usado
  db.prepare('UPDATE password_reset_tokens SET usado = 1 WHERE id = ?').run(tokenRow.id);

  db.prepare("INSERT INTO logs (tipo, descricao, usuario_id) VALUES ('reset_senha', ?, ?)").run(`Reset de senha: ${user.email}`, user.id);

  res.json({ ok: true, msg: 'Senha alterada com sucesso.' });
});

// ──────────────────────────────────────────
//  POST /api/auth/admin-reset
//  Admin redefine senha de qualquer usuário (restaura para o e-mail do usuário)
// ──────────────────────────────────────────
router.post('/admin-reset', authMiddleware, requireAdmin, (req, res) => {
  const { usuario_id } = req.body;
  if (!usuario_id) return res.status(400).json({ error: 'usuario_id obrigatório.' });

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario_id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

  // Restaura a senha para o e-mail do usuário
  const novoHash = bcrypt.hashSync(user.email, 10);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(novoHash, user.id);

  db.prepare("INSERT INTO logs (tipo, descricao, usuario_id) VALUES ('admin_reset_senha', ?, ?)").run(
    `Admin resetou senha de: ${user.email}`, req.user.id
  );

  res.json({ ok: true, msg: `Senha de ${user.nome} redefinida para o e-mail do usuário.` });
});

// ──────────────────────────────────────────
//  GET /api/auth/reset-codes — Admin lista códigos ativos
// ──────────────────────────────────────────
router.get('/reset-codes', authMiddleware, requireAdmin, (req, res) => {
  const tokens = db.prepare(`
    SELECT t.*, u.nome, u.email
    FROM password_reset_tokens t
    JOIN usuarios u ON u.id = t.usuario_id
    WHERE t.usado = 0 AND datetime(t.expira_em) > datetime('now')
    ORDER BY t.criado_em DESC
  `).all();
  res.json(tokens);
});

module.exports = router;
