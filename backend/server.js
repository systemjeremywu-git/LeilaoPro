require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ── MIDDLEWARES ──
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-n8n-secret'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── STATIC: serve o frontend ──
app.use(express.static(path.join(__dirname, '../frontend')));

// ── STATIC: serve os PDFs enviados ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API ROUTES ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/editais', require('./routes/editais'));
app.use('/api/leiloeiros', require('./routes/leiloeiros'));
app.use('/api/contratos', require('./routes/contratos'));

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── WEBHOOK STATUS CHECK ──
app.get('/api/health/webhooks', async (req, res) => {
  const fetch = require('node-fetch');
  const UMMENSE_URL = 'https://app.ummense.com/incoming-webhook/9e96d24e-bae0-4330-96a9-e11e29fae4e5';

  let ummenseStatus = 'offline';
  try {
    const r = await fetch(UMMENSE_URL, { method: 'HEAD', timeout: 5000 });
    ummenseStatus = (r.status < 500) ? 'online' : 'offline';
  } catch {
    ummenseStatus = 'offline';
  }

  res.json({
    n8n_retorno: 'online',
    ummense: ummenseStatus,
    time: new Date().toISOString()
  });
});

// ── SPA FALLBACK ──
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
  }
});

// ── START ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 LeilãoPro rodando na porta ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Endpoint n8n: POST http://localhost:${PORT}/api/editais/n8n-retorno\n`);
});
