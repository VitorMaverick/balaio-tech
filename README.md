# Balaio.tech — Blog Pessoal

Blog pessoal fullstack de um estudante de tecnologia compartilhando o que está aprendendo. Deploy em produção no Fly.io.

🔗 **Produção:** https://balaio-tech.fly.dev

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco de dados | SQLite (better-sqlite3) |
| Frontend | HTML/CSS/JS vanilla (SPA-like) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Upload de imagens | Multer + Sharp |
| Geração de thumbnail IA | Cloudflare Workers AI (SDXL) |
| Deploy | Fly.io (Docker + Volume persistente) |
| Fonts | Google Fonts (Fira Code + Inter) |

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│ Frontend (public/)                                    │
│  index.html      — página principal com posts        │
│  article.html    — visualização de artigo (SPA)      │
│  admin.html      — painel admin (CRUD + upload + IA) │
│  assets/         — CSS, JS                           │
│  uploads/        — imagens (volume persistente)      │
└──────────────────┬───────────────────────────────────┘
                   │ fetch /api/*
┌──────────────────▼───────────────────────────────────┐
│ Backend (server.js)                                   │
│  Express + JWT auth + Multer upload                   │
│  SQLite (articles, categories, images, users)         │
│  Endpoints: login, articles CRUD, upload, categorias  │
└──────────────────┬───────────────────────────────────┘
                   │ POST {prompt}
┌──────────────────▼───────────────────────────────────┐
│ Cloudflare Worker (Workers AI)                        │
│  Modelo: Stable Diffusion XL                          │
│  Recebe prompt → retorna PNG                          │
│  100k req/dia grátis                                  │
└──────────────────────────────────────────────────────┘
```

## Estrutura de diretórios

```
balaio-tech/
├── server.js                  # App principal Express
├── services/
│   └── imageGenerator.js      # Cliente do Cloudflare Worker (thumbnail IA)
├── public/
│   ├── index.html             # Página principal
│   ├── article.html           # Página de artigo
│   ├── admin.html             # Painel administrativo
│   ├── assets/css/            # Estilos
│   ├── assets/js/             # Scripts frontend
│   └── uploads/               # Imagens (dev local)
├── cloudflare-worker/
│   ├── worker.js              # Código do Worker de IA
│   └── wrangler.toml          # Config do Wrangler
├── autonomous_agent/          # Agente autônomo de melhorias
│   ├── agent.js               # Loop principal
│   ├── improvements.js        # 27 melhorias automáticas
│   ├── health.js              # Health check + restart
│   ├── logParser.js           # Análise de logs
│   └── config.json            # Configuração
├── Dockerfile                 # Build para Fly.io
├── fly.toml                   # Config Fly.io
└── package.json
```

## Desenvolvimento local

```bash
# Instalar dependências
npm install

# Rodar o servidor
npm run dev

# Acessar
# Blog:  http://localhost:3000
# Admin: http://localhost:3000/admin
```

**Credenciais padrão do admin:** `admin` / `admin123`

## API Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | /api/login | ❌ | Login → retorna JWT |
| GET | /api/categories | ❌ | Listar categorias |
| GET | /api/articles | ❌ | Listar artigos publicados |
| GET | /api/articles/:slug | ❌ | Artigo por slug |
| POST | /api/articles | ✅ | Criar artigo |
| PUT | /api/articles/:slug | ✅ | Editar artigo |
| DELETE | /api/articles/:slug | ✅ | Excluir artigo |
| POST | /api/upload | ✅ | Upload de imagem |
| POST | /api/admin/generate-thumbnail | ✅ | Gerar thumbnail com IA |
| GET | /api/images | ✅ | Listar imagens |

## Geração de Thumbnail com IA

O admin pode gerar thumbnails automaticamente a partir do título e descrição do artigo usando Stable Diffusion XL via Cloudflare Workers AI.

### Como funciona

1. Admin preenche título + descrição → botão "🎨 Gerar com IA" habilita
2. Frontend chama `POST /api/admin/generate-thumbnail` com `{ title, description }`
3. Backend monta prompt e chama o Cloudflare Worker
4. Worker executa Stable Diffusion XL → retorna imagem PNG
5. Backend redimensiona (1200x675) e comprime (JPEG 85%) com Sharp
6. Imagem salva no volume persistente → URL retornada ao frontend

### Configuração do Worker

1. Cloudflare Dashboard → Workers & Pages → Create → Hello World
2. Substituir código pelo conteúdo de `cloudflare-worker/worker.js`
3. Settings → Bindings → Add → **Workers AI** → variável: `AI`
4. Save and Deploy
5. Copiar a URL do worker (ex: `https://xxx.workers.dev`)

### Variáveis de ambiente necessárias

```bash
fly secrets set CLOUDFLARE_WORKER_URL=https://seu-worker.workers.dev -a balaio-tech
```

## Deploy (Fly.io)

### Primeira vez

```bash
# Instalar Fly CLI: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
fly launch   # cria app + volume
fly deploy
```

### Deploys subsequentes

```bash
fly deploy -a balaio-tech
```

### Infraestrutura

- **Região:** GRU (São Paulo)
- **VM:** 256MB RAM, 1 CPU
- **Volume:** 1GB persistente montado em `/data`
  - `/data/database.db` — banco SQLite
  - `/data/uploads/` — imagens
- **Auto-stop:** desligado (sempre ativo)

### Secrets configurados

```bash
fly secrets set CLOUDFLARE_WORKER_URL=https://xxx.workers.dev -a balaio-tech
fly secrets set JWT_SECRET=seu-secret -a balaio-tech
```

### Comandos úteis

```bash
fly status -a balaio-tech          # Status da máquina
fly logs -a balaio-tech            # Logs em tempo real
fly ssh console -a balaio-tech     # SSH no container
fly ssh sftp get /data/database.db ./backup.db -a balaio-tech  # Baixar banco
```

## Agente Autônomo (opcional)

Script Node.js que roda em loop e aplica melhorias automaticamente (lazy loading, sitemap, compressão, SEO, segurança, etc.). Faz backup antes de cada alteração e reverte se algo quebrar.

```bash
# Simular sem alterar nada
npm run agent:advanced:dry

# Aplicar 1 melhoria
npm run agent:advanced

# Rodar em loop (a cada 30 min)
npm run agent:advanced:loop
```

27 melhorias disponíveis incluindo: compressão de imagens, lazy loading, sitemap.xml, Open Graph meta tags, gzip, security headers, RSS feed, Service Worker, entre outras.

## Autor

**Maverick Dev** — estudante de tecnologia aprendendo em público.
## Estrutura
- `index.html` — página principal
- `assets/` — CSS, JS, imagens
- `technologies/` — artigos organizados por categoria
