#!/usr/bin/env node
/**
 * auto-agent.js — Agente autônomo de qualidade e automação.
 *
 * Uso:
 *   node auto-agent.js --config ./autonomous.config.json [opções]
 *
 * Opções:
 *   --config <path>      Arquivo de configuração (obrigatório)
 *   --interval <seconds> Intervalo entre ciclos (padrão: 1800 = 30min)
 *   --once               Executa um ciclo e sai
 *   --dry-run            Simula sem alterar arquivos
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// === PARSE ARGS ===
const args = process.argv.slice(2);
function getArg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const CONFIG_PATH = getArg('--config') || 'autonomous.config.json';
const INTERVAL = parseInt(getArg('--interval') || '1800', 10) * 1000;
const ONCE = args.includes('--once');
const DRY_RUN = args.includes('--dry-run');

// === LOAD CONFIG ===
if (!fs.existsSync(CONFIG_PATH)) { console.error(`Config não encontrado: ${CONFIG_PATH}`); process.exit(1); }
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const ROOT = path.resolve(path.dirname(CONFIG_PATH), config.rootDir || '.');
const CHANGELOG = path.join(ROOT, config.changelogFile || 'autonomous_actions.md');
const BACKUP_DIR = path.join(ROOT, config.backupDir || '.auto_backup');

// Track running child processes
const children = [];
let improvementIndex = 0;

// === UTILS ===
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (!DRY_RUN) fs.appendFileSync(CHANGELOG, line + '\n');
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, path.basename(filePath) + '.' + Date.now());
  fs.copyFileSync(filePath, dest);
  return dest;
}

function httpRequest(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json', ...(payload && { 'Content-Length': Buffer.byteLength(payload) }) },
      timeout: 10000
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function exec(cmd, cwd = ROOT) {
  try { return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 60000, stdio: 'pipe' }); }
  catch (e) { return e.stderr || e.message; }
}

// === SERVICE MANAGEMENT ===
async function checkHealth(service) {
  try {
    const { status } = await httpRequest(service.healthCheck);
    return status >= 200 && status < 500;
  } catch { return false; }
}

async function startServices() {
  for (const svc of config.services) {
    const alive = await checkHealth(svc);
    if (alive) {
      log(`[services] ${svc.name}: ✓ rodando`);
      continue;
    }
    log(`[services] ${svc.name}: iniciando...`);
    if (DRY_RUN) continue;

    const cwd = path.resolve(ROOT, svc.cwd || '.');
    const logFile = svc.logFile ? path.join(ROOT, svc.logFile) : '/dev/null';
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const out = fs.openSync(logFile, 'a');
    const child = spawn('sh', ['-c', svc.command], { cwd, detached: true, stdio: ['ignore', out, out] });
    child.unref();
    children.push(child);
    log(`[services] ${svc.name}: PID ${child.pid}`);

    // Wait for health
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      if (await checkHealth(svc)) { log(`[services] ${svc.name}: ✓ pronto`); break; }
    }
  }
}

// === TESTS ===
async function runTests() {
  let passed = 0, failed = 0;
  for (const test of config.tests || []) {
    try {
      const { status } = await httpRequest(test.url, test.method || 'GET', test.body || null);
      if (test.expectStatus && status !== test.expectStatus) {
        log(`[test] ✗ ${test.name}: esperado ${test.expectStatus}, recebeu ${status}`);
        failed++;
      } else {
        passed++;
      }
    } catch (e) {
      log(`[test] ✗ ${test.name}: ${e.message}`);
      failed++;
    }
  }
  log(`[test] Resultado: ${passed} passou, ${failed} falhou`);
  return failed;
}

// === LOG MONITORING ===
function monitorLogs() {
  const errors = [];
  for (const svc of config.services) {
    if (!svc.logFile) continue;
    const logPath = path.join(ROOT, svc.logFile);
    if (!fs.existsSync(logPath)) continue;

    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').slice(-100);
    for (const line of lines) {
      for (const issue of config.knownIssues || []) {
        if (new RegExp(issue.pattern).test(line)) {
          errors.push({ line, issue });
        }
      }
    }
  }
  return errors;
}

// === FIX ERRORS ===
function fixError(error) {
  const { issue } = error;
  log(`[fix] Detectado: "${issue.pattern}" → tentando "${issue.fix}"`);
  if (DRY_RUN) { log('[fix] (dry-run, pulando)'); return; }

  switch (issue.fix) {
    case 'killPort': {
      const port = issue.port || 3000;
      try { exec(`fuser -k ${port}/tcp`); } catch {}
      log(`[fix] Porta ${port} liberada`);
      break;
    }
    case 'ensureDir': {
      const dir = path.resolve(ROOT, issue.path);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      log(`[fix] Diretório criado: ${dir}`);
      break;
    }
    case 'npmInstall': {
      log('[fix] Executando npm install...');
      exec('npm install', ROOT);
      break;
    }
    default:
      log(`[fix] Correção "${issue.fix}" não implementada, pulando`);
  }
}

// === IMPROVEMENTS ===
function applyImprovement() {
  const improvements = config.improvements || [];
  if (improvements.length === 0) return;

  const imp = improvements[improvementIndex % improvements.length];
  improvementIndex++;

  log(`[improve] Aplicando: ${imp.name}`);
  if (DRY_RUN) { log('[improve] (dry-run, pulando)'); return; }

  switch (imp.type) {
    case 'regex-replace': {
      const glob = require('path');
      const files = (imp.files || []).flatMap(pattern => {
        const dir = path.dirname(path.resolve(ROOT, pattern));
        const ext = path.extname(pattern);
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
          .filter(f => f.endsWith(ext))
          .map(f => path.join(dir, f));
      });
      let modified = 0;
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const regex = new RegExp(imp.search, 'gi');
        const updated = content.replace(regex, imp.replace);
        if (updated !== content) {
          backupFile(file);
          fs.writeFileSync(file, updated);
          modified++;
        }
      }
      log(`[improve] ${modified} arquivo(s) modificado(s)`);
      break;
    }
    case 'script': {
      const output = exec(imp.command, ROOT);
      log(`[improve] Script executado: ${(output || '').slice(0, 200)}`);
      break;
    }
    default:
      log(`[improve] Tipo "${imp.type}" não suportado`);
  }
}

// === MAIN CYCLE ===
async function cycle() {
  log('══════════════════════════════════════');
  log(`[cycle] Início — ${config.name} ${DRY_RUN ? '(DRY-RUN)' : ''}`);

  // 1. Start services
  await startServices();

  // 2. Run tests
  const failures = await runTests();

  // 3. Monitor logs for known errors
  const errors = monitorLogs();
  if (errors.length > 0) {
    log(`[monitor] ${errors.length} erro(s) conhecidos detectados nos logs`);
    const seen = new Set();
    for (const err of errors) {
      if (seen.has(err.issue.pattern)) continue;
      seen.add(err.issue.pattern);
      fixError(err);
    }
  }

  // 4. If no critical errors, apply an improvement
  if (failures === 0 && errors.length === 0) {
    applyImprovement();
  } else {
    log('[improve] Pulando melhorias (há erros pendentes)');
  }

  log('[cycle] Fim');
}

// === ENTRY POINT ===
(async () => {
  log(`auto-agent v1.0 | config: ${CONFIG_PATH} | interval: ${INTERVAL / 1000}s | dry-run: ${DRY_RUN}`);

  await cycle();
  if (ONCE) { log('Modo --once: encerrando.'); process.exit(0); }

  setInterval(cycle, INTERVAL);
  log(`Próximo ciclo em ${INTERVAL / 1000}s. Ctrl+C para parar.`);
})();
