#!/usr/bin/env node
/**
 * autonomous_agent/agent.js
 * Loop principal do agente autônomo avançado.
 *
 * Flags:
 *   --interval <seconds>       Intervalo entre ciclos (padrão: 1800)
 *   --once                     Executa um ciclo e sai
 *   --dry-run                  Simula sem alterar
 *   --only-improvement <id>    Aplica apenas uma melhoria específica
 *   --deep-scan                Ativa deep-scan a cada 10 ciclos
 *   --no-auto-fix              Não corrigir erros (apenas reportar)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { log, loadState, saveState, shell, ROOT, timestamp } = require('./utils');
const { ensureHealthy, checkHealth } = require('./health');
const { parseRecentLogs, fixError } = require('./logParser');
const { improvements, getImprovementQueue } = require('./improvements');
const config = require('./config');

// Parse args
const args = process.argv.slice(2);
function getArg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
const INTERVAL = parseInt(getArg('--interval') || '1800', 10) * 1000;
const ONCE = args.includes('--once');
const DRY_RUN = args.includes('--dry-run');
const ONLY = getArg('--only-improvement');
const DEEP_SCAN = args.includes('--deep-scan');
const NO_AUTO_FIX = args.includes('--no-auto-fix');

let cycleCount = 0;
let totalApplied = 0;
let totalFailed = 0;

// ═══════════════════════════════════════════════════════════════════
// RIGOROUS TESTS
// ═══════════════════════════════════════════════════════════════════
async function rigorousTests() {
  const results = [];

  // 1. Syntax check
  const syntax = shell('node --check server.js');
  results.push({ name: 'syntax-check', ok: syntax.ok, detail: syntax.ok ? '' : syntax.output.slice(0, 200) });

  // 2. DB integrity
  try {
    const Database = require('better-sqlite3');
    if (fs.existsSync(config.databasePath)) {
      const db = new Database(config.databasePath, { readonly: true });
      db.prepare('SELECT 1').get();
      db.close();
      results.push({ name: 'db-integrity', ok: true });
    } else {
      results.push({ name: 'db-integrity', ok: true, detail: 'no db file' });
    }
  } catch (e) {
    results.push({ name: 'db-integrity', ok: false, detail: e.message });
  }

  // 3. Health check (if server is running)
  const alive = await checkHealth();
  if (alive) {
    results.push({ name: 'health-check', ok: true });
  } else {
    results.push({ name: 'health-check', ok: false, detail: 'server not responding' });
  }

  // 4. No new errors in logs (last 30 seconds)
  const errorLog = path.join(ROOT, 'logs', 'error.log');
  if (fs.existsSync(errorLog)) {
    const stat = fs.statSync(errorLog);
    const recentlyModified = Date.now() - stat.mtimeMs < 30000;
    results.push({ name: 'no-new-errors', ok: !recentlyModified });
  } else {
    results.push({ name: 'no-new-errors', ok: true });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// DEEP SCAN (every 10 cycles or on demand)
// ═══════════════════════════════════════════════════════════════════
function deepScan() {
  log('[deep-scan] Iniciando análise profunda...');

  // Disk space
  const diskResult = shell('df -h . 2>/dev/null | tail -1');
  if (diskResult.ok) log(`[deep-scan] Disco: ${diskResult.output.trim()}`);

  // Orphan files in uploads (not referenced in DB)
  try {
    const Database = require('better-sqlite3');
    if (fs.existsSync(config.databasePath) && fs.existsSync(config.uploadsPath)) {
      const db = new Database(config.databasePath, { readonly: true });
      const refs = db.prepare("SELECT url FROM images UNION SELECT thumbnail_url FROM articles WHERE thumbnail_url IS NOT NULL").all();
      db.close();
      const referenced = new Set(refs.map(r => path.basename(r.url || '')));
      const files = fs.readdirSync(config.uploadsPath);
      const orphans = files.filter(f => !referenced.has(f) && !f.startsWith('.'));
      log(`[deep-scan] Uploads: ${files.length} arquivos, ${orphans.length} órfãos`);
    }
  } catch {}

  // Broken links (check if articles reference non-existent images)
  try {
    const Database = require('better-sqlite3');
    if (fs.existsSync(config.databasePath)) {
      const db = new Database(config.databasePath, { readonly: true });
      const articles = db.prepare("SELECT slug, thumbnail_url FROM articles WHERE thumbnail_url IS NOT NULL AND thumbnail_url != ''").all();
      db.close();
      let broken = 0;
      for (const a of articles) {
        const imgPath = path.join(ROOT, 'public', a.thumbnail_url.replace(/^\//, ''));
        if (!fs.existsSync(imgPath)) broken++;
      }
      if (broken > 0) log(`[deep-scan] ⚠️ ${broken} thumbnails apontam para arquivos inexistentes`, 'WARN');
    }
  } catch {}

  // Node modules audit
  const audit = shell('npm audit --production --json 2>/dev/null');
  if (audit.ok) {
    try {
      const data = JSON.parse(audit.output);
      const vulns = data.metadata?.vulnerabilities || {};
      const total = (vulns.high || 0) + (vulns.critical || 0);
      if (total > 0) log(`[deep-scan] ⚠️ ${total} vulnerabilidades high/critical`, 'WARN');
      else log('[deep-scan] Sem vulnerabilidades críticas');
    } catch {}
  }

  log('[deep-scan] Análise concluída');
}

// ═══════════════════════════════════════════════════════════════════
// APPLY IMPROVEMENT WITH QUEUE FALLBACK
// ═══════════════════════════════════════════════════════════════════
async function applyImprovementWithQueue(state) {
  let queue;
  if (ONLY) {
    queue = [{ id: ONLY }];
  } else {
    queue = getImprovementQueue(state.applied, 3);
  }

  if (queue.length === 0) {
    log('Todas as melhorias já foram aplicadas! 🎉');
    return;
  }

  for (const target of queue) {
    if (!improvements[target.id]) {
      log(`[${target.id}] Sem implementação, pulando`, 'WARN');
      continue;
    }

    const imp = improvements[target.id];
    const needsApply = await imp.detect();

    if (!needsApply) {
      log(`[${target.id}] Já presente (detect=false), marcando`);
      state.applied.push(target.id);
      saveState(state);
      continue;
    }

    log(`[${target.id}] Selecionada (score: ${target.score || '—'}). Aplicando...`);

    if (DRY_RUN) {
      log(`[${target.id}] (dry-run, pulando apply)`);
      return;
    }

    const startTime = Date.now();
    try {
      await imp.apply();

      // RIGOROUS VERIFICATION
      const impVerify = await imp.verify();
      if (!impVerify) {
        throw new Error('verify() retornou false');
      }

      const tests = await rigorousTests();
      const failed = tests.filter(t => !t.ok);

      if (failed.length > 0 && failed.some(t => t.name === 'syntax-check' || t.name === 'db-integrity')) {
        // Critical failure — revert
        const failNames = failed.map(t => `${t.name}: ${t.detail || 'FAIL'}`).join(', ');
        throw new Error(`Testes falharam: ${failNames}`);
      }

      // SUCCESS
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`[${target.id}] ✓ Aplicada com sucesso (${elapsed}s)`);
      state.applied.push(target.id);
      state.history.push({ id: target.id, timestamp: new Date().toISOString(), status: 'success', elapsed: `${elapsed}s` });
      saveState(state);
      totalApplied++;
      return; // Success — exit queue

    } catch (e) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`[${target.id}] ✗ Falhou (${elapsed}s): ${e.message}. Revertendo...`, 'ERROR');
      try { await imp.revert(); } catch (re) { log(`[${target.id}] Erro no revert: ${re.message}`, 'ERROR'); }
      state.history.push({ id: target.id, timestamp: new Date().toISOString(), status: 'reverted', elapsed: `${elapsed}s`, error: e.message });
      saveState(state);
      totalFailed++;
      log(`[${target.id}] Tentando próxima da fila...`);
      // Continue to next in queue
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CYCLE
// ═══════════════════════════════════════════════════════════════════
async function cycle() {
  cycleCount++;
  log('══════════════════════════════════════════════════════════');
  log(`Ciclo #${cycleCount} ${DRY_RUN ? '(DRY-RUN)' : ''}`);

  // 1. Health check
  await ensureHealthy();

  // 2. Log analysis
  const errors = parseRecentLogs();
  if (errors.length > 0) {
    log(`Log analysis: ${errors.length} erro(s) detectado(s)`);
    if (!NO_AUTO_FIX && !DRY_RUN) {
      errors.forEach(e => fixError(e, DRY_RUN));
    } else {
      errors.forEach(e => log(`  → ${e.pattern} (${NO_AUTO_FIX ? 'no-auto-fix' : 'dry-run'})`));
    }
  } else {
    log('Log analysis: 0 erros');
  }

  // 3. Apply improvement (with queue fallback)
  const state = loadState();
  await applyImprovementWithQueue(state);

  // 4. Deep scan (every 10 cycles)
  if (DEEP_SCAN && cycleCount % 10 === 0) {
    deepScan();
  }

  // 5. Report every 10 cycles
  if (cycleCount % 10 === 0) {
    log(`📊 Resumo após ${cycleCount} ciclos: ${totalApplied} aplicadas, ${totalFailed} falhas, ${state.applied.length} total no estado`);
  }

  log('Ciclo concluído\n');
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════
(async () => {
  log(`auto-agent v3.0 | interval: ${INTERVAL / 1000}s | dry-run: ${DRY_RUN} | deep-scan: ${DEEP_SCAN}`);
  await cycle();
  if (ONCE) process.exit(0);
  setInterval(cycle, INTERVAL);
  log(`Rodando em loop. Próximo ciclo em ${INTERVAL / 1000}s. Ctrl+C para parar.`);
})();
