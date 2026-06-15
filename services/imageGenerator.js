/**
 * services/imageGenerator.js
 * Gera thumbnail via Cloudflare Workers AI (SDXL).
 * O Worker retorna imagem PNG diretamente.
 */
const https = require('https');
const http = require('http');
const path = require('path');
const sharp = require('sharp');

function buildPrompt(title, description) {
  return `Professional blog thumbnail: ${title}. ${description.slice(0, 150)}. Modern, minimalist, vibrant colors, no text overlay.`;
}

function callWorker(workerUrl, prompt, secret) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ prompt });
    const parsed = new URL(workerUrl);
    const mod = parsed.protocol === 'https:' ? https : http;

    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(secret && { 'Authorization': `Bearer ${secret}` })
      }
    };

    console.log(`[imgGen] POST ${workerUrl}`);
    console.log(`[imgGen] Prompt: "${prompt.slice(0, 80)}..."`);

    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[imgGen] <- Status: ${res.statusCode} | Size: ${buffer.length} bytes | Type: ${res.headers['content-type']}`);

        if (res.statusCode !== 200) {
          const errText = buffer.toString().slice(0, 300);
          return reject(new Error(`Worker ${res.statusCode}: ${errText}`));
        }

        if (buffer.length < 1000) {
          return reject(new Error(`Imagem inválida (${buffer.length} bytes): ${buffer.toString().slice(0, 200)}`));
        }

        resolve(buffer);
      });
    });

    req.on('error', e => { console.error(`[imgGen] Request error:`, e.message); reject(e); });
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout: 60s')); });
    req.write(payload);
    req.end();
  });
}

async function generateThumbnail(title, description, uploadsPath) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  if (!workerUrl) throw new Error('CLOUDFLARE_WORKER_URL não configurado');

  const secret = process.env.CLOUDFLARE_WORKER_SECRET || '';

  console.log(`[imgGen] === START === Titulo: "${title}"`);
  const prompt = buildPrompt(title, description);
  const buffer = await callWorker(workerUrl, prompt, secret);

  console.log(`[imgGen] Processando com sharp...`);
  const filename = `auto_thumb_${Date.now()}.jpg`;
  const outputPath = path.join(uploadsPath, filename);
  await sharp(buffer)
    .resize({ width: 1200, height: 675, fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  console.log(`[imgGen] === DONE === /uploads/${filename}`);
  return { url: `/uploads/${filename}`, filename };
}

module.exports = { generateThumbnail };
