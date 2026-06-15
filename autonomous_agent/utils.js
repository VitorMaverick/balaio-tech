/**
 * autonomous_agent/utils.js
 * Utilitários: backup, execução de shell, logging.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(__dirname, 'backups');
const CHANGELOG = path.join(ROOT, 'autonomous_changelog.md');
const STATE_DIR = path.join(__dirname, 'state');

// Ensure dirs exist
[BACKUP_DIR, STATE_DIR, path.join(ROOT, 'logs')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

function timestamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

function log(msg, level = 'INFO') {
  const line = `[${timestamp()}] [${level}] ${msg}`;
  console.log(line);
  fs.appendFileSync(CHANGELOG, line + '\n');
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const rel = path.relative(ROOT, filePath).replace(/[\/\\]/g, '_');
  const dest = path.join(BACKUP_DIR, `${rel}.${Date.now()}`);
  fs.copyFileSync(filePath, dest);
  return dest;
}

function restoreBackup(backupPath, originalPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, originalPath);
    return true;
  }
  return false;
}

function shell(cmd, cwd = ROOT) {
  try {
    return { ok: true, output: execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }) };
  } catch (e) {
    return { ok: false, output: e.stderr || e.stdout || e.message };
  }
}

function loadState() {
  const file = path.join(STATE_DIR, 'appliedImprovements.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'));
  return { applied: [], history: [] };
}

function saveState(state) {
  const file = path.join(STATE_DIR, 'appliedImprovements.json');
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

function findFiles(dir, pattern, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findFiles(full, pattern, results);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

module.exports = { ROOT, BACKUP_DIR, STATE_DIR, log, backupFile, restoreBackup, shell, loadState, saveState, findFiles, timestamp };
