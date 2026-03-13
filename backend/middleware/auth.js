const jwt = require('jsonwebtoken');
const db  = require('../db/database');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT * FROM usuarios WHERE id = ? AND ativo = 1').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.perfil !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

function requirePermissao(modulo) {
  return (req, res, next) => {
    if (req.user.perfil === 'admin') return next();
    const perms = req.user.permissoes.split(',');

    if (Array.isArray(modulo)) {
      const temPermissao = modulo.some(m => perms.includes(m));
      if (!temPermissao) {
        return res.status(403).json({ error: `Sem permissão. Requer um dos módulos: ${modulo.join(', ')}` });
      }
    } else {
      if (!perms.includes(modulo)) {
        return res.status(403).json({ error: `Sem permissão para o módulo: ${modulo}` });
      }
    }
    next();
  };
}

module.exports = { authMiddleware, requireAdmin, requirePermissao };
