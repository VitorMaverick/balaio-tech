/**
 * autonomous_agent/improvements.js
 * Biblioteca de melhorias. Cada uma tem: detect(), apply(), verify(), revert().
 */
const fs = require('fs');
const path = require('path');
const { ROOT, log, backupFile, restoreBackup, shell, findFiles } = require('./utils');
const config = require('./config');

const improvements = {};

// ═══════════════════════════════════════════════════════════════════
// 1. COMPRESS IMAGES
// ═══════════════════════════════════════════════════════════════════
improvements['compress-images'] = {
  backups: [],
  async detect() {
    if (!fs.existsSync(config.uploadsPath)) return false;
    const files = fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    // Check if any file is > 100KB (potential for compression)
    return files.some(f => fs.statSync(path.join(config.uploadsPath, f)).size > 100 * 1024);
  },
  async apply() {
    const sharp = require('sharp');
    const files = fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    let totalSaved = 0, count = 0;
    this.backups = [];

    for (const file of files) {
      const filePath = path.join(config.uploadsPath, file);
      const stat = fs.statSync(filePath);
      if (stat.size < 100 * 1024) continue;

      const backup = backupFile(filePath);
      this.backups.push({ backup, original: filePath });

      const buffer = fs.readFileSync(filePath);
      let output;
      if (/\.png$/i.test(file)) {
        output = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      } else {
        output = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      }
      if (output.length < stat.size) {
        fs.writeFileSync(filePath, output);
        totalSaved += stat.size - output.length;
        count++;
      }
    }
    log(`[compress] ${count} imagens comprimidas. Economia: ${(totalSaved / 1024).toFixed(1)}KB`);
  },
  async verify() {
    // Verify files still exist and are readable
    const files = fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    return files.length > 0;
  },
  async revert() {
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
    log('[compress] Revertido');
  }
};

// ═══════════════════════════════════════════════════════════════════
// 2. LAZY LOADING
// ═══════════════════════════════════════════════════════════════════
improvements['lazy-loading'] = {
  backups: [],
  async detect() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    return files.some(f => {
      const c = fs.readFileSync(f, 'utf-8');
      return /<img(?![^>]*loading=)/i.test(c);
    });
  },
  async apply() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    this.backups = [];
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const updated = content.replace(/<img(?![^>]*loading=)([^>]*?)(\/?>)/gi, '<img loading="lazy"$1$2');
      if (updated !== content) {
        this.backups.push({ backup: backupFile(file), original: file });
        fs.writeFileSync(file, updated);
        count++;
      }
    }
    log(`[lazy-loading] ${count} arquivo(s) atualizados`);
  },
  async verify() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    return !files.some(f => {
      const c = fs.readFileSync(f, 'utf-8');
      return /<img(?![^>]*loading=)/i.test(c);
    });
  },
  async revert() {
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 3. SITEMAP
// ═══════════════════════════════════════════════════════════════════
improvements['sitemap'] = {
  backups: [],
  async detect() {
    return !fs.existsSync(path.join(ROOT, 'public', 'sitemap.xml'));
  },
  async apply() {
    const Database = require('better-sqlite3');
    const db = new Database(config.databasePath, { readonly: true });
    const articles = db.prepare("SELECT slug, updated_at FROM articles WHERE published = 1").all();
    db.close();

    const baseUrl = process.env.BASE_URL || 'https://balaio.fly.dev';
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}</loc><priority>1.0</priority></url>
${articles.map(a => `  <url><loc>${baseUrl}/article/${a.slug}</loc><priority>0.8</priority></url>`).join('\n')}
</urlset>`;
    fs.writeFileSync(path.join(ROOT, 'public', 'sitemap.xml'), xml);
    log(`[sitemap] Gerado com ${articles.length + 1} URLs`);
  },
  async verify() {
    const file = path.join(ROOT, 'public', 'sitemap.xml');
    return fs.existsSync(file) && fs.readFileSync(file, 'utf-8').includes('<urlset');
  },
  async revert() {
    const file = path.join(ROOT, 'public', 'sitemap.xml');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 4. OPEN GRAPH META TAGS
// ═══════════════════════════════════════════════════════════════════
improvements['og-meta'] = {
  backups: [],
  async detect() {
    const file = path.join(ROOT, 'public', 'article.html');
    if (!fs.existsSync(file)) return false;
    return !fs.readFileSync(file, 'utf-8').includes('og:title');
  },
  async apply() {
    const file = path.join(ROOT, 'public', 'article.html');
    this.backups = [{ backup: backupFile(file), original: file }];
    const content = fs.readFileSync(file, 'utf-8');
    const ogTags = `    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Balaio.tech">
    <meta id="og-title" property="og:title" content="">
    <meta id="og-description" property="og:description" content="">
    <meta id="og-image" property="og:image" content="">`;
    fs.writeFileSync(file, content.replace('</head>', ogTags + '\n</head>'));
    log('[og-meta] Meta tags Open Graph adicionadas');
  },
  async verify() {
    const file = path.join(ROOT, 'public', 'article.html');
    return fs.existsSync(file) && fs.readFileSync(file, 'utf-8').includes('og:title');
  },
  async revert() {
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 5. GZIP COMPRESSION
// ═══════════════════════════════════════════════════════════════════
improvements['gzip'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('compression');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    let content = fs.readFileSync(serverFile, 'utf-8');
    // Add require
    content = `const compression = require('compression');\n` + content;
    // Add middleware after app creation
    content = content.replace('app.use(express.json());', 'app.use(compression());\napp.use(express.json());');
    fs.writeFileSync(serverFile, content);
    log('[gzip] Middleware compression adicionado');
  },
  async verify() {
    const { ok } = shell('node --check server.js');
    return ok;
  },
  async revert() {
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 6. RSS FEED
// ═══════════════════════════════════════════════════════════════════
improvements['rss-feed'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('/rss.xml');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const rssRoute = `
// === RSS FEED ===
app.get('/rss.xml', (req, res) => {
  const articles = db.prepare("SELECT title, slug, description, created_at FROM articles WHERE published = 1 ORDER BY created_at DESC LIMIT 20").all();
  const baseUrl = process.env.BASE_URL || 'https://balaio.fly.dev';
  const items = articles.map(a => \`  <item><title>\${a.title}</title><link>\${baseUrl}/article/\${a.slug}</link><description>\${a.description || ''}</description><pubDate>\${new Date(a.created_at).toUTCString()}</pubDate></item>\`).join('\\n');
  res.type('application/rss+xml').send(\`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Balaio.tech</title><link>\${baseUrl}</link><description>Blog de tecnologia</description>\${items}</channel></rss>\`);
});
`;
    fs.writeFileSync(serverFile, content.replace('app.listen(', rssRoute + '\napp.listen('));
    log('[rss-feed] Endpoint /rss.xml adicionado');
  },
  async verify() {
    const { ok } = shell('node --check server.js');
    return ok;
  },
  async revert() {
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 7. CUSTOM 404
// ═══════════════════════════════════════════════════════════════════
improvements['custom-404'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('404');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const handler = `
// === 404 Handler ===
app.use((req, res) => {
  res.status(404).json({ error: 'Página não encontrada', path: req.path });
});
`;
    fs.writeFileSync(serverFile, content.replace('app.listen(', handler + '\napp.listen('));
    log('[custom-404] Handler 404 adicionado');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 8. DB BACKUP
// ═══════════════════════════════════════════════════════════════════
improvements['db-backup'] = {
  backups: [],
  async detect() {
    const backupDir = path.join(ROOT, 'backups', 'db');
    if (!fs.existsSync(backupDir)) return true;
    const files = fs.readdirSync(backupDir);
    if (files.length === 0) return true;
    // Run if last backup is older than 24h
    const latest = files.sort().reverse()[0];
    const ts = parseInt(latest.split('.').slice(-1)[0]) || 0;
    return Date.now() - ts > 86400000;
  },
  async apply() {
    const backupDir = path.join(ROOT, 'backups', 'db');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `database.db.${Date.now()}`);
    if (fs.existsSync(config.databasePath)) {
      fs.copyFileSync(config.databasePath, dest);
      log(`[db-backup] Backup salvo: ${dest}`);
      // Keep only last 7
      const files = fs.readdirSync(backupDir).sort().reverse();
      for (const f of files.slice(7)) fs.unlinkSync(path.join(backupDir, f));
    }
  },
  async verify() {
    const backupDir = path.join(ROOT, 'backups', 'db');
    return fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0;
  },
  async revert() { /* no-op: backup creation doesn't need reverting */ }
};

// ═══════════════════════════════════════════════════════════════════
// 9. HEALTH ENDPOINT
// ═══════════════════════════════════════════════════════════════════
improvements['health-endpoint'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes("'/health'");
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const route = `\n// === HEALTH ===\napp.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));\n`;
    // Insert after express.json() middleware
    fs.writeFileSync(serverFile, content.replace('app.use(express.json());', 'app.use(express.json());\n' + route));
    log('[health-endpoint] GET /health adicionado');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 10. SECURITY HEADERS
// ═══════════════════════════════════════════════════════════════════
improvements['security-headers'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('X-Content-Type-Options');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const middleware = `
// === SECURITY HEADERS ===
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
`;
    fs.writeFileSync(serverFile, content.replace('app.use(express.json());', middleware + 'app.use(express.json());'));
    log('[security-headers] Headers de segurança adicionados');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 11. CACHE HEADERS
// ═══════════════════════════════════════════════════════════════════
improvements['cache-headers'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('maxAge');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    // Replace express.static to include maxAge
    const updated = content.replace(
      "app.use(express.static(path.join(__dirname, 'public')))",
      "app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }))"
    );
    fs.writeFileSync(serverFile, updated);
    log('[cache-headers] Cache headers (7d) para estáticos');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 12. IMAGE ALT AUDIT
// ═══════════════════════════════════════════════════════════════════
improvements['img-alt-audit'] = {
  backups: [],
  async detect() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    return files.some(f => /<img(?![^>]*alt=)/i.test(fs.readFileSync(f, 'utf-8')));
  },
  async apply() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    this.backups = [];
    let count = 0;
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const updated = content.replace(/<img(?![^>]*alt=)([^>]*?)(\/?>)/gi, '<img alt=""$1$2');
      if (updated !== content) {
        this.backups.push({ backup: backupFile(file), original: file });
        fs.writeFileSync(file, updated);
        count++;
      }
    }
    log(`[img-alt-audit] ${count} arquivo(s) — alt="" adicionado em imgs sem alt`);
  },
  async verify() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    return !files.some(f => /<img(?![^>]*alt=)/i.test(fs.readFileSync(f, 'utf-8')));
  },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 13. WEBP CONVERSION
// ═══════════════════════════════════════════════════════════════════
improvements['webp-conversion'] = {
  backups: [],
  async detect() {
    if (!fs.existsSync(config.uploadsPath)) return false;
    const jpgs = fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    return jpgs.some(f => !fs.existsSync(path.join(config.uploadsPath, f.replace(/\.[^.]+$/, '.webp'))));
  },
  async apply() {
    const sharp = require('sharp');
    const files = fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    let count = 0;
    for (const file of files) {
      const webpPath = path.join(config.uploadsPath, file.replace(/\.[^.]+$/, '.webp'));
      if (fs.existsSync(webpPath)) continue;
      await sharp(path.join(config.uploadsPath, file)).webp({ quality: 80 }).toFile(webpPath);
      count++;
    }
    log(`[webp-conversion] ${count} imagens convertidas para WebP`);
  },
  async verify() {
    const files = fs.readdirSync(config.uploadsPath).filter(f => f.endsWith('.webp'));
    return files.length > 0;
  },
  async revert() {
    const webps = fs.readdirSync(config.uploadsPath).filter(f => f.endsWith('.webp'));
    webps.forEach(f => fs.unlinkSync(path.join(config.uploadsPath, f)));
  }
};

// ═══════════════════════════════════════════════════════════════════
// 14. STRUCTURED DATA (JSON-LD)
// ═══════════════════════════════════════════════════════════════════
improvements['structured-data'] = {
  backups: [],
  async detect() {
    const file = path.join(ROOT, 'public', 'article.html');
    if (!fs.existsSync(file)) return false;
    return !fs.readFileSync(file, 'utf-8').includes('application/ld+json');
  },
  async apply() {
    const file = path.join(ROOT, 'public', 'article.html');
    this.backups = [{ backup: backupFile(file), original: file }];
    const content = fs.readFileSync(file, 'utf-8');
    const jsonLd = `    <script id="json-ld" type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","author":{"@type":"Person","name":"Maverick Dev"}}</script>`;
    fs.writeFileSync(file, content.replace('</head>', jsonLd + '\n</head>'));
    log('[structured-data] JSON-LD Schema.org adicionado');
  },
  async verify() {
    const file = path.join(ROOT, 'public', 'article.html');
    return fs.readFileSync(file, 'utf-8').includes('application/ld+json');
  },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 15. SERVICE WORKER
// ═══════════════════════════════════════════════════════════════════
improvements['service-worker'] = {
  backups: [],
  async detect() { return !fs.existsSync(path.join(ROOT, 'public', 'sw.js')); },
  async apply() {
    const sw = `const CACHE='balaio-v1';const ASSETS=['/','/assets/css/main.css'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`;
    fs.writeFileSync(path.join(ROOT, 'public', 'sw.js'), sw);

    // Register in index.html
    const idx = path.join(ROOT, 'public', 'index.html');
    if (fs.existsSync(idx)) {
      this.backups = [{ backup: backupFile(idx), original: idx }];
      const html = fs.readFileSync(idx, 'utf-8');
      if (!html.includes('sw.js')) {
        fs.writeFileSync(idx, html.replace('</body>', `<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js')</script>\n</body>`));
      }
    }
    log('[service-worker] Service Worker adicionado');
  },
  async verify() { return fs.existsSync(path.join(ROOT, 'public', 'sw.js')); },
  async revert() {
    const swPath = path.join(ROOT, 'public', 'sw.js');
    if (fs.existsSync(swPath)) fs.unlinkSync(swPath);
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 16. SOCIAL SHARE BUTTONS
// ═══════════════════════════════════════════════════════════════════
improvements['social-share'] = {
  backups: [],
  async detect() {
    const file = path.join(ROOT, 'public', 'article.html');
    if (!fs.existsSync(file)) return false;
    return !fs.readFileSync(file, 'utf-8').includes('share-buttons');
  },
  async apply() {
    const file = path.join(ROOT, 'public', 'article.html');
    this.backups = [{ backup: backupFile(file), original: file }];
    const content = fs.readFileSync(file, 'utf-8');
    const shareHtml = `<div id="share-buttons" style="margin:20px 0;display:flex;gap:8px;">
<a onclick="window.open('https://twitter.com/intent/tweet?url='+encodeURIComponent(location.href),'_blank','width=550,height=420')" style="cursor:pointer;padding:6px 12px;background:#1da1f2;color:#fff;border-radius:4px;font-size:0.8rem;">Twitter</a>
<a onclick="window.open('https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(location.href),'_blank','width=550,height=420')" style="cursor:pointer;padding:6px 12px;background:#0077b5;color:#fff;border-radius:4px;font-size:0.8rem;">LinkedIn</a>
</div>`;
    fs.writeFileSync(file, content.replace('</body>', shareHtml + '\n</body>'));
    log('[social-share] Botões de compartilhamento adicionados');
  },
  async verify() { return fs.readFileSync(path.join(ROOT, 'public', 'article.html'), 'utf-8').includes('share-buttons'); },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 17. SEARCH INDEX
// ═══════════════════════════════════════════════════════════════════
improvements['search-index'] = {
  backups: [],
  async detect() { return !fs.existsSync(path.join(ROOT, 'public', 'search-index.json')); },
  async apply() {
    const Database = require('better-sqlite3');
    if (!fs.existsSync(config.databasePath)) { log('[search-index] DB não encontrado'); return; }
    const db = new Database(config.databasePath, { readonly: true });
    const articles = db.prepare("SELECT title, slug, description, category_slug FROM articles WHERE published = 1").all();
    db.close();
    fs.writeFileSync(path.join(ROOT, 'public', 'search-index.json'), JSON.stringify(articles));
    log(`[search-index] Índice gerado com ${articles.length} artigos`);
  },
  async verify() { return fs.existsSync(path.join(ROOT, 'public', 'search-index.json')); },
  async revert() {
    const f = path.join(ROOT, 'public', 'search-index.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 18. PERFORMANCE MONITOR MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════
improvements['performance-monitor'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('x-response-time');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const mw = `
// === PERFORMANCE MONITOR ===
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    res.setHeader('x-response-time', ms.toFixed(2) + 'ms');
    if (ms > 2000) console.warn('[SLOW]', req.method, req.originalUrl, ms.toFixed(0) + 'ms');
  });
  next();
});
`;
    fs.writeFileSync(serverFile, content.replace('app.use(express.json());', mw + 'app.use(express.json());'));
    log('[performance-monitor] Middleware de performance adicionado');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 19. RESPONSIVE IMAGES (srcset)
// ═══════════════════════════════════════════════════════════════════
improvements['responsive-images'] = {
  backups: [],
  async detect() {
    const files = findFiles(path.join(ROOT, 'public'), /\.html$/);
    return files.some(f => {
      const c = fs.readFileSync(f, 'utf-8');
      return /<img[^>]+src="\/uploads\/[^"]+"/i.test(c) && !c.includes('srcset');
    });
  },
  async apply() {
    const sharp = require('sharp');
    this.backups = [];
    // Generate 480w versions for existing uploads
    const imgs = fs.existsSync(config.uploadsPath) ?
      fs.readdirSync(config.uploadsPath).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)) : [];
    let generated = 0;
    for (const img of imgs) {
      const smallPath = path.join(config.uploadsPath, img.replace(/(\.[^.]+)$/, '-480w$1'));
      if (fs.existsSync(smallPath)) continue;
      try {
        await sharp(path.join(config.uploadsPath, img)).resize({ width: 480 }).toFile(smallPath);
        generated++;
      } catch {}
    }
    log(`[responsive-images] ${generated} thumbnails 480w geradas`);
  },
  async verify() {
    if (!fs.existsSync(config.uploadsPath)) return true;
    return fs.readdirSync(config.uploadsPath).some(f => f.includes('-480w'));
  },
  async revert() {
    if (!fs.existsSync(config.uploadsPath)) return;
    fs.readdirSync(config.uploadsPath).filter(f => f.includes('-480w')).forEach(f => fs.unlinkSync(path.join(config.uploadsPath, f)));
  }
};

// ═══════════════════════════════════════════════════════════════════
// 20. PREFETCH LINKS
// ═══════════════════════════════════════════════════════════════════
improvements['prefetch-links'] = {
  backups: [],
  async detect() {
    const idx = path.join(ROOT, 'public', 'index.html');
    if (!fs.existsSync(idx)) return false;
    return !fs.readFileSync(idx, 'utf-8').includes('rel="prefetch"');
  },
  async apply() {
    const Database = require('better-sqlite3');
    if (!fs.existsSync(config.databasePath)) return;
    const db = new Database(config.databasePath, { readonly: true });
    const top = db.prepare("SELECT slug FROM articles WHERE published = 1 ORDER BY created_at DESC LIMIT 3").all();
    db.close();
    const idx = path.join(ROOT, 'public', 'index.html');
    this.backups = [{ backup: backupFile(idx), original: idx }];
    const content = fs.readFileSync(idx, 'utf-8');
    const links = top.map(a => `<link rel="prefetch" href="/article/${a.slug}">`).join('\n    ');
    fs.writeFileSync(idx, content.replace('</head>', `    ${links}\n</head>`));
    log(`[prefetch-links] ${top.length} links prefetch adicionados`);
  },
  async verify() { return fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf-8').includes('rel="prefetch"'); },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 21. ROBOTS.TXT
// ═══════════════════════════════════════════════════════════════════
improvements['robots-txt'] = {
  backups: [],
  async detect() { return !fs.existsSync(path.join(ROOT, 'public', 'robots.txt')); },
  async apply() {
    const baseUrl = process.env.BASE_URL || 'https://balaio.fly.dev';
    const content = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;
    fs.writeFileSync(path.join(ROOT, 'public', 'robots.txt'), content);
    log('[robots-txt] robots.txt criado');
  },
  async verify() { return fs.existsSync(path.join(ROOT, 'public', 'robots.txt')); },
  async revert() { const f = path.join(ROOT, 'public', 'robots.txt'); if (fs.existsSync(f)) fs.unlinkSync(f); }
};

// ═══════════════════════════════════════════════════════════════════
// 22. MANIFEST.JSON (PWA)
// ═══════════════════════════════════════════════════════════════════
improvements['pwa-manifest'] = {
  backups: [],
  async detect() { return !fs.existsSync(path.join(ROOT, 'public', 'manifest.json')); },
  async apply() {
    const manifest = { name: 'Balaio.tech', short_name: 'Balaio', start_url: '/', display: 'standalone', background_color: '#0f1419', theme_color: '#7c3aed', icons: [] };
    fs.writeFileSync(path.join(ROOT, 'public', 'manifest.json'), JSON.stringify(manifest, null, 2));
    // Link in index.html
    const idx = path.join(ROOT, 'public', 'index.html');
    if (fs.existsSync(idx)) {
      this.backups = [{ backup: backupFile(idx), original: idx }];
      const html = fs.readFileSync(idx, 'utf-8');
      if (!html.includes('manifest.json')) {
        fs.writeFileSync(idx, html.replace('</head>', '    <link rel="manifest" href="/manifest.json">\n</head>'));
      }
    }
    log('[pwa-manifest] manifest.json criado');
  },
  async verify() { return fs.existsSync(path.join(ROOT, 'public', 'manifest.json')); },
  async revert() {
    const f = path.join(ROOT, 'public', 'manifest.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// 23. CANONICAL URLS
// ═══════════════════════════════════════════════════════════════════
improvements['canonical-urls'] = {
  backups: [],
  async detect() {
    const file = path.join(ROOT, 'public', 'article.html');
    if (!fs.existsSync(file)) return false;
    return !fs.readFileSync(file, 'utf-8').includes('rel="canonical"');
  },
  async apply() {
    const file = path.join(ROOT, 'public', 'article.html');
    this.backups = [{ backup: backupFile(file), original: file }];
    const content = fs.readFileSync(file, 'utf-8');
    const tag = '    <link id="canonical" rel="canonical" href="">';
    fs.writeFileSync(file, content.replace('</head>', tag + '\n</head>'));
    log('[canonical-urls] Link canonical adicionado');
  },
  async verify() { return fs.readFileSync(path.join(ROOT, 'public', 'article.html'), 'utf-8').includes('rel="canonical"'); },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 24. CONTENT-SECURITY-POLICY
// ═══════════════════════════════════════════════════════════════════
improvements['csp-header'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('Content-Security-Policy');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const mw = `
// === CSP ===
app.use((req, res, next) => { res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:;"); next(); });
`;
    fs.writeFileSync(serverFile, content.replace('app.use(express.json());', mw + 'app.use(express.json());'));
    log('[csp-header] Content-Security-Policy adicionado');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 25. ERROR LOGGING TO FILE
// ═══════════════════════════════════════════════════════════════════
improvements['error-log-file'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('error.log');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const snippet = `
// === ERROR LOGGING ===
const errLogStream = require('fs').createWriteStream(require('path').join(__dirname, 'logs', 'error.log'), { flags: 'a' });
app.use((err, req, res, next) => { errLogStream.write('[' + new Date().toISOString() + '] ' + err.stack + '\\n'); res.status(500).json({ error: 'Internal error' }); });
`;
    fs.writeFileSync(serverFile, content.replace('app.listen(', snippet + '\napp.listen('));
    log('[error-log-file] Logging de erros para arquivo adicionado');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 26. RATE LIMITING
// ═══════════════════════════════════════════════════════════════════
improvements['rate-limiting'] = {
  backups: [],
  async detect() {
    const serverFile = path.join(ROOT, 'server.js');
    return !fs.readFileSync(serverFile, 'utf-8').includes('rateLimitMap');
  },
  async apply() {
    const serverFile = path.join(ROOT, 'server.js');
    this.backups = [{ backup: backupFile(serverFile), original: serverFile }];
    const content = fs.readFileSync(serverFile, 'utf-8');
    const mw = `
// === RATE LIMITING (simple in-memory) ===
const rateLimitMap = new Map();
app.use('/api/', (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > 100) return res.status(429).json({ error: 'Too many requests' });
  next();
});
`;
    fs.writeFileSync(serverFile, content.replace('app.use(express.json());', mw + 'app.use(express.json());'));
    log('[rate-limiting] Rate limiting simples adicionado (100 req/min)');
  },
  async verify() { return shell('node --check server.js').ok; },
  async revert() { for (const { backup, original } of this.backups || []) restoreBackup(backup, original); }
};

// ═══════════════════════════════════════════════════════════════════
// 27. FAVICON
// ═══════════════════════════════════════════════════════════════════
improvements['favicon'] = {
  backups: [],
  async detect() { return !fs.existsSync(path.join(ROOT, 'public', 'favicon.svg')); },
  async apply() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🧺</text></svg>`;
    fs.writeFileSync(path.join(ROOT, 'public', 'favicon.svg'), svg);
    // Link in index.html
    const idx = path.join(ROOT, 'public', 'index.html');
    if (fs.existsSync(idx)) {
      this.backups = [{ backup: backupFile(idx), original: idx }];
      const html = fs.readFileSync(idx, 'utf-8');
      if (!html.includes('favicon')) {
        fs.writeFileSync(idx, html.replace('</head>', '    <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n</head>'));
      }
    }
    log('[favicon] favicon.svg adicionado');
  },
  async verify() { return fs.existsSync(path.join(ROOT, 'public', 'favicon.svg')); },
  async revert() {
    const f = path.join(ROOT, 'public', 'favicon.svg');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    for (const { backup, original } of this.backups || []) restoreBackup(backup, original);
  }
};

// ═══════════════════════════════════════════════════════════════════
// SCORE-BASED SELECTION
// ═══════════════════════════════════════════════════════════════════
function getNextImprovement(appliedIds) {
  const configImprovements = config.improvements || [];
  const candidates = configImprovements
    .filter(c => !appliedIds.includes(c.id) && improvements[c.id])
    .map(c => ({ ...c, score: (c.impact * 10) / (c.effort * c.risk) }))
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

function getImprovementQueue(appliedIds, max = 3) {
  const configImprovements = config.improvements || [];
  return configImprovements
    .filter(c => !appliedIds.includes(c.id) && improvements[c.id])
    .map(c => ({ ...c, score: (c.impact * 10) / (c.effort * c.risk) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

module.exports = { improvements, getNextImprovement, getImprovementQueue };
