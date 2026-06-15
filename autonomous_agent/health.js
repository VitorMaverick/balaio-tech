/**
 * autonomous_agent/health.js
 * Verifica saúde do servidor e reinicia se necessário.
 */
const http = require('http');
const { log, shell, ROOT } = require('./utils');
const config = require('./config');

function checkHealth() {
  return new Promise((resolve) => {
    const url = new URL(config.healthEndpoint);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function ensureHealthy() {
  const alive = await checkHealth();
  if (alive) {
    log('Health check: OK');
    return true;
  }

  log('Health check: FALHOU — tentando restart', 'WARN');
  for (let attempt = 1; attempt <= config.maxRestartAttempts; attempt++) {
    // Kill port first
    shell(`fuser -k ${config.port}/tcp 2>/dev/null || true`);
    await new Promise(r => setTimeout(r, 1000));

    // Start
    const { spawn } = require('child_process');
    const logPath = require('path').join(ROOT, 'logs', 'out.log');
    const fs = require('fs');
    if (!fs.existsSync(require('path').dirname(logPath))) fs.mkdirSync(require('path').dirname(logPath), { recursive: true });
    const out = fs.openSync(logPath, 'a');
    const child = spawn('sh', ['-c', config.restartCommand], { cwd: ROOT, detached: true, stdio: ['ignore', out, out] });
    child.unref();

    log(`Restart attempt ${attempt}/${config.maxRestartAttempts} (PID: ${child.pid})`);
    await new Promise(r => setTimeout(r, 4000));

    if (await checkHealth()) {
      log('Restart: OK');
      return true;
    }
  }
  log('Restart: FALHOU após todas as tentativas', 'ERROR');
  return false;
}

module.exports = { checkHealth, ensureHealthy };
