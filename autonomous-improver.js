#!/usr/bin/env node
/**
 * autonomous-improver.js
 * Agente autônomo para otimização do balaio-tech.
 * 
 * Uso: node autonomous-improver.js [opções]
 *   --interval <seconds>  Rodar em loop (padrão: executa uma vez e sai)
 *   --dry-run             Apenas simula, não altera arquivos
 *   --no-compress         Pula compressão de imagens
 *   --auto-fix            Permite correções automáticas (fly.toml, etc)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// === CONFIG ===
const ROOT = path.resolve(__dirname);
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(ROOT, 'public', 'uploads');
const DB_PATH = process.env.DATABASE_PATH || path.join(ROOT, 'database.db');
const PUBLIC_PATH = path.join(ROOT, 'public');
const CHANGELOG = path.join(ROOT, 'auto_changelog.md');
const BACKUP_DIR = path.join(ROOT, '.auto_backup');

// === PARSE ARGS ===
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_COMPRESS = args.includes('--no-compress');
const AUTO_FIX = args.includes('--auto-fix');
const intervalIdx = args.indexOf('--interval');
const INTERVAL = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) * 1000 : 0;

// === LOGGING ===
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (!DRY_RUN) {
    fs.appendFileSync(CHANGELOG, line + '\n');
  }
}

function backupFile(filePath) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, path.basename(filePath) + '.' + Date.now());
  fs.copyFileSync(filePath, dest);
  return dest;
}

// === COMPRESS IMAGES ===
async function compressImages() {
  if (NO_COMPRESS) { log('[compress] Pulando (--no-compress)'); return; }
  if (!fs.existsSync(UPLOADS_PATH)) { log('[compress] Pasta de uploads não encontrada'); return; }

  const files = fs.readdirSync(UPLOADS_PATH).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  let totalSaved = 0;

  for (const file of files) {
    const filePath = path.join(UPLOADS_PATH, file);
    const stat = fs.statSync(filePath);
    const originalSize = stat.size;

    // Skip files under 50KB (already compressed)
    if (originalSize < 50 * 1024) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      let output;
      if (/\.png$/i.test(file)) {
        output = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      } else {
        output = await sharp(buffer).resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      }

      if (output.length < originalSize) {
        const saved = originalSize - output.length;
        totalSaved += saved;
        if (!DRY_RUN) {
          backupFile(filePath);
          fs.writeFileSync(filePath, output);
        }
        log(`[compress] ${file}: ${(originalSize / 1024).toFixed(1)}KB → ${(output.length / 1024).toFixed(1)}KB (-${(saved / 1024).toFixed(1)}KB)`);
      }
    } catch (e) {
      log(`[compress] Erro em ${file}: ${e.message}`);
    }
  }
  log(`[compress] Total economizado: ${(totalSaved / 1024).toFixed(1)}KB ${DRY_RUN ? '(dry-run)' : ''}`);
}

// === CHECK EXTRA VOLUMES (fly.toml) ===
function checkExtraVolumes() {
  const flyToml = path.join(ROOT, 'fly.toml');
  if (!fs.existsSync(flyToml)) { log('[volumes] fly.toml não encontrado'); return; }

  const content = fs.readFileSync(flyToml, 'utf-8');
  const mounts = content.match(/\[\[mounts\]\]/g) || [];

  if (mounts.length > 1) {
    log(`[volumes] ⚠️ ALERTA: ${mounts.length} volumes detectados em fly.toml (esperado: 1)`);
    if (AUTO_FIX && !DRY_RUN) {
      backupFile(flyToml);
      // Keep only the first [[mounts]] block
      const lines = content.split('\n');
      let mountCount = 0;
      let inExtraMount = false;
      const fixed = lines.filter(line => {
        if (line.trim() === '[[mounts]]') {
          mountCount++;
          if (mountCount > 1) { inExtraMount = true; return false; }
          inExtraMount = false;
        } else if (inExtraMount && (line.trim().startsWith('[') || line.trim() === '')) {
          inExtraMount = false;
        }
        return !inExtraMount;
      });
      fs.writeFileSync(flyToml, fixed.join('\n'));
      log('[volumes] Volumes extras removidos de fly.toml');
    }
  } else {
    log('[volumes] OK — 1 volume configurado');
  }
}

// === ADD LAZY LOADING ===
function addLazyLoading() {
  const htmlFiles = findFiles(PUBLIC_PATH, /\.(html|ejs)$/);
  let modified = 0;

  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Add loading="lazy" to img tags that don't have it
    const updated = content.replace(/<img(?![^>]*loading=)([^>]*?)(\s*\/?>)/gi, '<img loading="lazy"$1$2');
    if (updated !== content) {
      modified++;
      if (!DRY_RUN) { backupFile(file); fs.writeFileSync(file, updated); }
      log(`[lazy] ${path.relative(ROOT, file)}: loading="lazy" adicionado`);
    }
  }
  log(`[lazy] ${modified} arquivo(s) modificado(s) ${DRY_RUN ? '(dry-run)' : ''}`);
}

// === GENERATE SITEMAP ===
function generateSitemap() {
  const Database = require('better-sqlite3');
  if (!fs.existsSync(DB_PATH)) { log('[sitemap] Banco não encontrado'); return; }

  const baseUrl = process.env.BASE_URL || 'https://balaio.fly.dev';
  const db = new Database(DB_PATH, { readonly: true });
  const articles = db.prepare("SELECT slug, updated_at FROM articles WHERE published = 1 ORDER BY created_at DESC").all();
  db.close();

  const urls = [
    { loc: baseUrl, priority: '1.0' },
    ...articles.map(a => ({
      loc: `${baseUrl}/article/${a.slug}`,
      lastmod: a.updated_at ? a.updated_at.split(' ')[0] : new Date().toISOString().split('T')[0],
      priority: '0.8'
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  const dest = path.join(PUBLIC_PATH, 'sitemap.xml');
  if (!DRY_RUN) fs.writeFileSync(dest, xml);
  log(`[sitemap] Gerado com ${urls.length} URLs ${DRY_RUN ? '(dry-run)' : ''}`);
}

// === ADD META TAGS (Open Graph) ===
function addMetaTags() {
  const articleHtml = path.join(PUBLIC_PATH, 'article.html');
  if (!fs.existsSync(articleHtml)) { log('[meta] article.html não encontrado'); return; }

  const content = fs.readFileSync(articleHtml, 'utf-8');
  if (content.includes('og:title')) { log('[meta] Meta tags OG já presentes'); return; }

  // Insert OG meta tags placeholder in <head> (will be filled dynamically by JS)
  const ogTags = `
    <!-- Open Graph (preenchido via JS) -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Balaio.tech">
    <meta id="og-title" property="og:title" content="Balaio.tech">
    <meta id="og-description" property="og:description" content="">
    <meta id="og-image" property="og:image" content="">
    <meta id="og-url" property="og:url" content="">`;

  const updated = content.replace('</head>', ogTags + '\n</head>');
  if (updated !== content) {
    if (!DRY_RUN) { backupFile(articleHtml); fs.writeFileSync(articleHtml, updated); }
    log('[meta] Meta tags Open Graph adicionadas em article.html');
  }
}

// === UTILS ===
function findFiles(dir, pattern) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...findFiles(full, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// === MAIN ===
async function run() {
  log('=== autonomous-improver iniciado ===');
  if (DRY_RUN) log('⚠️ Modo DRY-RUN: nenhuma alteração será feita');

  await compressImages();
  checkExtraVolumes();
  addLazyLoading();
  generateSitemap();
  addMetaTags();

  log('=== Ciclo concluído ===\n');
}

if (INTERVAL > 0) {
  log(`Rodando em loop a cada ${INTERVAL / 1000}s`);
  run();
  setInterval(run, INTERVAL);
} else {
  run().catch(e => { console.error(e); process.exit(1); });
}
