const express = require('express');
const db = require('../db/database');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ══════════════════════════════════════════
//  GET /api/leiloeiros — lista todos
// ══════════════════════════════════════════
router.get('/', (req, res) => {
    const { busca, ativo } = req.query;
    let sql = `
    SELECT l.*,
           COUNT(m.id) as total_matriculas
    FROM leiloeiros l
    LEFT JOIN leiloeiro_matriculas m ON m.leiloeiro_id = l.id AND m.ativo = 1
    WHERE 1=1
  `;
    const params = [];

    if (busca) {
        sql += ' AND (l.nome LIKE ? OR l.cpf LIKE ? OR l.email LIKE ?)';
        const like = `%${busca}%`;
        params.push(like, like, like);
    }
    if (ativo !== undefined) {
        sql += ' AND l.ativo = ?';
        params.push(ativo === 'true' ? 1 : 0);
    } else {
        sql += ' AND l.ativo = 1';
    }

    sql += ' GROUP BY l.id ORDER BY l.nome';
    res.json(db.prepare(sql).all(...params));
});

// ══════════════════════════════════════════
//  GET /api/leiloeiros/:id — detalhe com matrículas
// ══════════════════════════════════════════
router.get('/:id', (req, res) => {
    const leiloeiro = db.prepare('SELECT * FROM leiloeiros WHERE id = ?').get(req.params.id);
    if (!leiloeiro) return res.status(404).json({ error: 'Leiloeiro não encontrado.' });

    const matriculas = db.prepare(
        'SELECT * FROM leiloeiro_matriculas WHERE leiloeiro_id = ? AND ativo = 1 ORDER BY uf'
    ).all(req.params.id);

    res.json({ ...leiloeiro, matriculas });
});

// ══════════════════════════════════════════
//  POST /api/leiloeiros — cria (só admin)
// ══════════════════════════════════════════
router.post('/', requireAdmin, (req, res) => {
    const { nome, cpf, email, telefone, matriculas } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const result = db.prepare(
        'INSERT INTO leiloeiros (nome, cpf, email, telefone) VALUES (?, ?, ?, ?)'
    ).run(nome, cpf || null, email || null, telefone || null);

    const leiloeiro_id = result.lastInsertRowid;

    // Insere matrículas se vieram junto
    if (Array.isArray(matriculas) && matriculas.length > 0) {
        const stmt = db.prepare(`
      INSERT INTO leiloeiro_matriculas (leiloeiro_id, uf, numero_matricula, junta, logradouro, numero, complemento, cidade, estado, cep, rg, rg_data_expedicao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const m of matriculas) {
            if (!m.uf || !m.numero_matricula) continue;
            stmt.run(leiloeiro_id, m.uf, m.numero_matricula, m.junta || null, 
                     m.logradouro || null, m.numero || null, m.complemento || null, 
                     m.cidade || null, m.estado || null, m.cep || null, 
                     m.rg || null, m.rg_data_expedicao || null);
        }
    }

    res.status(201).json({ ok: true, id: leiloeiro_id });
});

// ══════════════════════════════════════════
//  PUT /api/leiloeiros/:id — edita (só admin)
// ══════════════════════════════════════════
router.put('/:id', requireAdmin, (req, res) => {
    const { nome, cpf, email, telefone, ativo } = req.body;
    const leiloeiro = db.prepare('SELECT * FROM leiloeiros WHERE id = ?').get(req.params.id);
    if (!leiloeiro) return res.status(404).json({ error: 'Leiloeiro não encontrado.' });

    db.prepare(`
    UPDATE leiloeiros SET nome=?, cpf=?, email=?, telefone=?, ativo=? WHERE id=?
  `).run(
        nome || leiloeiro.nome,
        cpf !== undefined ? cpf : leiloeiro.cpf,
        email !== undefined ? email : leiloeiro.email,
        telefone !== undefined ? telefone : leiloeiro.telefone,
        ativo !== undefined ? (ativo ? 1 : 0) : leiloeiro.ativo,
        req.params.id
    );

    res.json({ ok: true });
});

// ══════════════════════════════════════════
//  DELETE /api/leiloeiros/:id — inativa (só admin)
// ══════════════════════════════════════════
router.delete('/:id', requireAdmin, (req, res) => {
    db.prepare('UPDATE leiloeiros SET ativo = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

// ══════════════════════════════════════════
//  GET /api/leiloeiros/:id/matriculas
// ══════════════════════════════════════════
router.get('/:id/matriculas', (req, res) => {
    const matriculas = db.prepare(
        'SELECT * FROM leiloeiro_matriculas WHERE leiloeiro_id = ? AND ativo = 1 ORDER BY uf'
    ).all(req.params.id);
    res.json(matriculas);
});

// ══════════════════════════════════════════
//  POST /api/leiloeiros/:id/matriculas (só admin)
// ══════════════════════════════════════════
router.post('/:id/matriculas', requireAdmin, (req, res) => {
    const { uf, numero_matricula, junta, logradouro, numero, complemento, cidade, estado, cep, rg, rg_data_expedicao } = req.body;
    if (!uf || !numero_matricula) return res.status(400).json({ error: 'UF e número de matrícula são obrigatórios.' });

    const leiloeiro = db.prepare('SELECT id FROM leiloeiros WHERE id = ?').get(req.params.id);
    if (!leiloeiro) return res.status(404).json({ error: 'Leiloeiro não encontrado.' });

    const result = db.prepare(`
    INSERT INTO leiloeiro_matriculas (leiloeiro_id, uf, numero_matricula, junta, logradouro, numero, complemento, cidade, estado, cep, rg, rg_data_expedicao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, uf, numero_matricula, junta || null, 
         logradouro || null, numero || null, complemento || null, 
         cidade || null, estado || null, cep || null, 
         rg || null, rg_data_expedicao || null);

    res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// ══════════════════════════════════════════
//  PUT /api/leiloeiros/:id/matriculas/:mid (só admin)
// ══════════════════════════════════════════
router.put('/:id/matriculas/:mid', requireAdmin, (req, res) => {
    const { uf, numero_matricula, junta, logradouro, numero, complemento, cidade, estado, cep, rg, rg_data_expedicao } = req.body;
    const m = db.prepare('SELECT * FROM leiloeiro_matriculas WHERE id = ? AND leiloeiro_id = ?').get(req.params.mid, req.params.id);
    if (!m) return res.status(404).json({ error: 'Matrícula não encontrada.' });

    db.prepare(`
    UPDATE leiloeiro_matriculas SET uf=?, numero_matricula=?, junta=?, logradouro=?, numero=?, complemento=?, cidade=?, estado=?, cep=?, rg=?, rg_data_expedicao=? WHERE id=?
  `).run(
        uf || m.uf,
        numero_matricula || m.numero_matricula,
        junta !== undefined ? junta : m.junta,
        logradouro !== undefined ? logradouro : m.logradouro,
        numero !== undefined ? numero : m.numero,
        complemento !== undefined ? complemento : m.complemento,
        cidade !== undefined ? cidade : m.cidade,
        estado !== undefined ? estado : m.estado,
        cep !== undefined ? cep : m.cep,
        rg !== undefined ? rg : m.rg,
        rg_data_expedicao !== undefined ? rg_data_expedicao : m.rg_data_expedicao,
        req.params.mid
    );

    res.json({ ok: true });
});

// ══════════════════════════════════════════
//  DELETE /api/leiloeiros/:id/matriculas/:mid (só admin)
// ══════════════════════════════════════════
router.delete('/:id/matriculas/:mid', requireAdmin, (req, res) => {
    db.prepare('UPDATE leiloeiro_matriculas SET ativo = 0 WHERE id = ? AND leiloeiro_id = ?').run(req.params.mid, req.params.id);
    res.json({ ok: true });
});

module.exports = router;
