# Plans & Specs — Thumbnail IA + Agente Autônomo

## 1. Arquitetura

```
┌────────────────────────────────────────────────────┐
│ Admin (public/admin.html)                           │
│  • Botão "🎨 Gerar com IA" (desabilitado s/ dados) │
│  • Preview + aceitar/rejeitar                       │
│  • Coexiste com upload manual                       │
└──────────────┬─────────────────────────────────────┘
               │ POST /api/admin/generate-thumbnail
               │ { title, description }
┌──────────────▼─────────────────────────────────────┐
│ server.js (Express)                                 │
│  └─ authMiddleware (JWT)                            │
│  └─ services/imageGenerator.js                      │
│       • Monta prompt a partir de título+descrição   │
│       • Chama Replicate API (SDXL)                  │
│       • Polling até imagem pronta (~30s)            │
│       • Baixa imagem → sharp (resize+compress)      │
│       • Salva em UPLOADS_PATH (volume persistente)  │
│       • Retorna { url: "/uploads/auto_thumb_X.jpg"} │
└──────────────┬─────────────────────────────────────┘
               │ HTTPS
┌──────────────▼─────────────────────────────────────┐
│ Replicate API (Stable Diffusion XL)                 │
│  POST /v1/predictions → poll → image URL            │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ autonomous-improver.js (cron/manual)                │
│  • compressImages() → sharp resize+compress         │
│  • checkExtraVolumes() → parse fly.toml             │
│  • addLazyLoading() → <img loading="lazy">         │
│  • generateSitemap() → sitemap.xml do SQLite        │
│  • addMetaTags() → OG tags no article.html          │
│  • Flags: --dry-run, --interval, --no-compress      │
└────────────────────────────────────────────────────┘
```

## 2. Dependências

| Pacote | Uso | Já existia? |
|--------|-----|-------------|
| `sharp` | Resize/compress imagens | ❌ Novo |
| `better-sqlite3` | Leitura do banco (agente) | ✅ |
| `express` | Servidor HTTP | ✅ |
| `jsonwebtoken` | Auth JWT | ✅ |
| `multer` | Upload manual | ✅ |
| Node.js `https` | Cliente HTTP para Replicate | ✅ (builtin) |

**Nenhuma dependência externa pesada** (não precisa de axios, replicate SDK, etc).

## 3. Segurança

- Endpoint `/api/admin/generate-thumbnail` protegido pelo mesmo `authMiddleware` JWT do admin
- `REPLICATE_API_TOKEN` nunca exposta ao frontend (fica em env var/fly secrets)
- Sharp processa buffer em memória antes de gravar (sem execução de código malicioso)
- Input sanitizado: título max 500 chars, descrição max 1000 chars no prompt

## 4. Fluxo de Dados

1. Admin preenche título + descrição → botão habilitado
2. Click → `POST /api/admin/generate-thumbnail` com JSON
3. Backend constrói prompt: "Professional blog thumbnail: {title}. {desc}. Modern..."
4. Cria prediction no Replicate (model SDXL, 1024x576)
5. Poll a cada 2s (timeout 90s) até `status === "succeeded"`
6. Baixa a imagem gerada (URL temporária do Replicate CDN)
7. Sharp: resize max 1200px largura, JPEG quality 85
8. Salva como `auto_thumb_{timestamp}.jpg` no volume
9. Retorna `{ url: "/uploads/auto_thumb_xxx.jpg" }`
10. Frontend exibe preview; admin aceita → salva no `thumbnail_url` do artigo

## 5. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Replicate offline/lento | Timeout 90s + erro amigável ao frontend |
| Créditos gratuitos esgotados | Erro claro "API limit reached", upload manual disponível |
| Imagem gerada inadequada | Admin pode rejeitar e gerar novamente ou usar upload |
| Volume cheio | sharp comprime agressivamente (~85% quality); agente comprime existentes |

## 6. Variáveis de Ambiente

```env
REPLICATE_API_TOKEN=r8_xxxxxxxxxx   # Obrigatório para geração IA
UPLOADS_PATH=/data/uploads          # Volume Fly.io (prod) ou public/uploads (dev)
DATABASE_PATH=/data/database.db     # SQLite no volume
BASE_URL=https://balaio.fly.dev     # Para sitemap
JWT_SECRET=seu-secret               # Já existente
```

## 7. Arquivos Criados/Modificados

| Arquivo | Ação |
|---------|------|
| `services/imageGenerator.js` | **Novo** — Cliente Replicate + sharp |
| `autonomous-improver.js` | **Novo** — Agente autônomo |
| `server.js` | Adicionado endpoint generate-thumbnail |
| `public/admin.html` | Botão "Gerar com IA" + lógica JS |
| `package.json` | Adicionado `sharp`, scripts `improve*` |

## 8. Como obter a chave do Replicate (grátis)

1. Acesse https://replicate.com → Sign up com GitHub
2. Vá em https://replicate.com/account/api-tokens
3. Crie um token → copie (formato `r8_xxxxxxxx`)
4. Free tier: ~$0.55 créditos iniciais (~50 gerações SDXL)
5. Configure: `fly secrets set REPLICATE_API_TOKEN=r8_xxx`

## 9. Comandos

```bash
# Instalar dependências
npm install

# Dev local (precisa REPLICATE_API_TOKEN no .env ou export)
export REPLICATE_API_TOKEN=r8_xxx
npm run dev

# Testar geração (após login no admin)
curl -X POST http://localhost:3000/api/admin/generate-thumbnail \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Git para iniciantes","description":"Aprenda os comandos básicos do Git"}'

# Agente autônomo
npm run improve          # Executa uma vez
npm run improve:dry      # Simula sem alterar
npm run improve:loop     # Loop a cada 1h

# Deploy
fly deploy
fly secrets set REPLICATE_API_TOKEN=r8_xxx
```
