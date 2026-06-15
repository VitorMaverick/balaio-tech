/**
 * Cloudflare Worker: balaio-thumbnail-worker
 * 
 * Recebe POST { prompt } → gera imagem via Workers AI → retorna PNG binary.
 * 
 * Deploy via Wrangler ou cole no dashboard do Cloudflare Workers.
 * 
 * wrangler.toml necessário:
 *   name = "balaio-thumbnail-worker"
 *   main = "worker.js"
 *   compatibility_date = "2024-01-01"
 *   [ai]
 *   binding = "AI"
 */
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: corsHeaders() });
    }

    // Auth opcional (se quiser proteger o worker)
    const authHeader = request.headers.get('Authorization');
    if (env.WORKER_SECRET && authHeader !== `Bearer ${env.WORKER_SECRET}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders() });
    }

    try {
      const { prompt } = await request.json();
      if (!prompt) {
        return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: corsHeaders() });
      }

      const result = await env.AI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
        prompt,
        width: 1024,
        height: 576,
        num_steps: 20,
        guidance: 7.5
      });

      // result é um ReadableStream com a imagem PNG
      return new Response(result, {
        headers: { ...corsHeaders(), 'Content-Type': 'image/png' }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders() });
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
