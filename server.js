const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Uploads path
const uploadsPath = process.env.UPLOADS_PATH || path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

// Multer config
const storage = multer.diskStorage({
  destination: uploadsPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// Config
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ctrl-s-blog-secret-2024';

const app = express();
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const log = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`;
    console.log(log);
    if (res.statusCode >= 400) console.error('  ⚠️', log);
  });
  next();
});

// Error handler global
process.on('uncaughtException', (err) => {
  console.error(`[FATAL] ${err.message}\n${err.stack}`);
});
process.on('unhandledRejection', (reason) => {
  console.error(`[UNHANDLED REJECTION] ${reason}`);
});

// DB
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create tables if not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT
  );
  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    content TEXT NOT NULL,
    category_slug TEXT NOT NULL,
    author TEXT DEFAULT 'Maverick Dev',
    published INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_slug) REFERENCES categories(slug)
  );
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_slug TEXT,
    url TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate: add thumbnail_url if missing
try { db.exec('ALTER TABLE articles ADD COLUMN thumbnail_url TEXT'); } catch {}

// Auto-seed: admin user + categories if empty
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('admin', hash);
  console.log('[seed] Admin user created');
}
if (!db.prepare('SELECT id FROM categories LIMIT 1').get()) {
  const cats = [
    ['Web','web','🌐'],['Back-end','back-end','⚙️'],['Banco de Dados','banco-de-dados','🗃️'],
    ['Ferramentas','ferramentas','🔧'],['Projetos','projetos','🚀'],['Carreira','carreira','💡'],
    ['Tutoriais','tutoriais','📝'],['Arquivo','arquivo','📂']
  ];
  const ins = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
  cats.forEach(c => ins.run(...c));
  console.log('[seed] 8 categories created');
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsPath));

// === AUTH ===
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username e senha obrigatórios' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Credenciais inválidas' });
  const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// === UPLOAD ===
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Imagem inválida (jpg/png/webp/gif, máx 5MB)' });
  const url = `/uploads/${req.file.filename}`;
  const articleSlug = req.body.article_slug || null;
  const result = db.prepare("INSERT INTO images (article_slug, url, filename) VALUES (?, ?, ?)").run(articleSlug, url, req.file.filename);
  res.json({ url, id: result.lastInsertRowid });
});

// === CATEGORIAS ===
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

// === ARTIGOS ===
app.get('/api/articles', (req, res) => {
  const { category, limit, offset, showAll } = req.query;
  let sql = 'SELECT id, title, slug, description, thumbnail_url, category_slug, author, created_at, updated_at, published FROM articles';
  const conditions = [];
  const params = [];
  if (!showAll) { conditions.push('published = 1'); }
  if (category) { conditions.push('category_slug = ?'); params.push(category); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }
  if (offset) { sql += ' OFFSET ?'; params.push(Number(offset)); }
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/articles/:slug', (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE slug = ?').get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Artigo não encontrado' });
  res.json(article);
});

app.post('/api/articles', authMiddleware, (req, res) => {
  const { title, slug, description, content, category_slug, author, thumbnail_url } = req.body;
  if (!title || !slug || !content || !category_slug) return res.status(400).json({ error: 'Campos obrigatórios: title, slug, content, category_slug' });
  try {
    const result = db.prepare("INSERT INTO articles (title, slug, description, thumbnail_url, content, category_slug, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))").run(title, slug, description || '', thumbnail_url || null, content, category_slug, author || 'Maverick Dev');
    res.status(201).json({ id: result.lastInsertRowid, slug });
  } catch (e) {
    if (e.message.includes('UNIQUE')) res.status(409).json({ error: 'Slug já existe' });
    else res.status(500).json({ error: e.message });
  }
});

app.put('/api/articles/:slug', authMiddleware, (req, res) => {
  const { title, description, content, category_slug, thumbnail_url } = req.body;
  const existing = db.prepare('SELECT id FROM articles WHERE slug = ?').get(req.params.slug);
  if (!existing) return res.status(404).json({ error: 'Artigo não encontrado' });
  db.prepare("UPDATE articles SET title = COALESCE(?, title), description = COALESCE(?, description), content = COALESCE(?, content), category_slug = COALESCE(?, category_slug), thumbnail_url = COALESCE(?, thumbnail_url), updated_at = datetime('now') WHERE slug = ?").run(title || null, description || null, content || null, category_slug || null, thumbnail_url !== undefined ? thumbnail_url : null, req.params.slug);
  res.json({ success: true });
});

app.delete('/api/articles/:slug', authMiddleware, (req, res) => {
  const images = db.prepare('SELECT * FROM images WHERE article_slug = ?').all(req.params.slug);
  for (const img of images) {
    const filePath = path.join(uploadsPath, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM images WHERE article_slug = ?').run(req.params.slug);
  const result = db.prepare('DELETE FROM articles WHERE slug = ?').run(req.params.slug);
  if (result.changes === 0) return res.status(404).json({ error: 'Artigo não encontrado' });
  res.json({ success: true });
});

app.put('/api/articles/:slug/toggle', authMiddleware, (req, res) => {
  const article = db.prepare('SELECT published FROM articles WHERE slug = ?').get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Artigo não encontrado' });
  const newVal = article.published ? 0 : 1;
  db.prepare('UPDATE articles SET published = ? WHERE slug = ?').run(newVal, req.params.slug);
  res.json({ published: newVal });
});

// === IMAGENS ===
app.get('/api/images', authMiddleware, (req, res) => {
  const { article_slug } = req.query;
  if (article_slug) {
    res.json(db.prepare('SELECT * FROM images WHERE article_slug = ? ORDER BY created_at DESC').all(article_slug));
  } else {
    res.json(db.prepare('SELECT * FROM images ORDER BY created_at DESC').all());
  }
});

app.delete('/api/images/:id', authMiddleware, (req, res) => {
  const img = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!img) return res.status(404).json({ error: 'Imagem não encontrada' });
  const filePath = path.join(uploadsPath, img.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// === SPA-like routing para artigos ===
app.get('/article/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'article.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Legacy paths redirect
app.get('/technologies/:cat/articles/:slug/index.html', (req, res) => {
  res.redirect(`/article/${req.params.slug}`);
});

// === CLEANUP ===
const cron = require('node-cron');
const cleanup = require('./cleanup');

cron.schedule('0 3 1 * *', () => {
  console.log('[cron] Limpeza mensal de imagens...');
  console.log('[cron]', cleanup());
});

app.post('/api/admin/cleanup', authMiddleware, (req, res) => {
  const result = cleanup();
  res.json({ success: true, ...result });
});

app.listen(PORT, () => console.log(`Balaio.tech rodando em http://localhost:${PORT}`));
