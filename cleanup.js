const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function cleanup() {
  const db = new Database(path.join(__dirname, 'database.db'));
  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) { db.close(); return { removedDisk: 0, removedDb: 0, removedOrphan: 0 }; }

  const files = fs.readdirSync(uploadsDir);
  let removedDisk = 0, removedDb = 0, removedOrphan = 0;

  // 1. Arquivos no disco sem registro no banco
  for (const file of files) {
    if (!db.prepare('SELECT id FROM images WHERE filename = ?').get(file)) {
      fs.unlinkSync(path.join(uploadsDir, file));
      removedDisk++;
      console.log(`[cleanup] Disco sem registro: ${file}`);
    }
  }

  // 2. Registros no banco cujo arquivo não existe
  for (const img of db.prepare('SELECT * FROM images').all()) {
    if (!fs.existsSync(path.join(uploadsDir, img.filename))) {
      db.prepare('DELETE FROM images WHERE id = ?').run(img.id);
      removedDb++;
      console.log(`[cleanup] Banco sem arquivo: ${img.filename}`);
    }
  }

  // 3. Imagens de artigos que não existem mais
  const orphans = db.prepare(`SELECT images.* FROM images WHERE article_slug IS NOT NULL AND article_slug NOT IN (SELECT slug FROM articles)`).all();
  for (const img of orphans) {
    const filePath = path.join(uploadsDir, img.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.prepare('DELETE FROM images WHERE id = ?').run(img.id);
    removedOrphan++;
    console.log(`[cleanup] Órfã (artigo removido): ${img.filename}`);
  }

  db.close();
  return { removedDisk, removedDb, removedOrphan };
}

module.exports = cleanup;
if (require.main === module) { console.log('Limpeza:', cleanup()); }
