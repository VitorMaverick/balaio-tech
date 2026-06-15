/**
 * autonomous_agent/logParser.js
 * Analisa logs em busca de erros conhecidos e executa correções.
 */
const fs = require('fs');
const path = require('path');
const { log, shell, ROOT } = require('./utils');
const config = require('./config');

function parseRecentLogs() {
  const errors = [];
  for (const logFile of config.logFiles) {
    const fullPath = path.resolve(ROOT, logFile);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n').slice(-200);

    for (const line of lines) {
      for (const known of config.knownErrors) {
        if (new RegExp(known.pattern).test(line)) {
          errors.push({ line: line.trim(), action: known.action, pattern: known.pattern });
        }
      }
    }
  }
  // Deduplicate by action
  const seen = new Set();
  return errors.filter(e => { if (seen.has(e.action)) return false; seen.add(e.action); return true; });
}

function fixError(error, dryRun = false) {
  log(`[logParser] Erro detectado: "${error.pattern}" → ação: ${error.action}`);
  if (dryRun) { log('[logParser] (dry-run, pulando)'); return; }

  switch (error.action) {
    case 'killPort':
      shell(`fuser -k ${config.port}/tcp 2>/dev/null || true`);
      log(`[logParser] Porta ${config.port} liberada`);
      break;
    case 'npmInstall':
      log('[logParser] Executando npm install...');
      shell('npm install', ROOT);
      break;
    case 'restoreDb': {
      const backups = path.join(__dirname, 'backups');
      const dbBackups = fs.existsSync(backups) ?
        fs.readdirSync(backups).filter(f => f.includes('database')).sort().reverse() : [];
      if (dbBackups.length > 0) {
        fs.copyFileSync(path.join(backups, dbBackups[0]), config.databasePath);
        log('[logParser] Banco restaurado do backup');
      } else {
        log('[logParser] Nenhum backup do banco disponível', 'WARN');
      }
      break;
    }
    case 'ensureUploads':
      if (!fs.existsSync(config.uploadsPath)) fs.mkdirSync(config.uploadsPath, { recursive: true });
      log(`[logParser] Diretório de uploads criado: ${config.uploadsPath}`);
      break;
    case 'restart':
      shell(`fuser -k ${config.port}/tcp 2>/dev/null || true`);
      log('[logParser] Serviço reiniciado via kill');
      break;
    default:
      log(`[logParser] Ação "${error.action}" não implementada`, 'WARN');
  }
}

module.exports = { parseRecentLogs, fixError };
