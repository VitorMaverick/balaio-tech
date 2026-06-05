# Deploy Balaio.tech — Fly.io

## Status: ⏳ Pronto para deploy

Os arquivos de configuração foram criados. O deploy será executado com `flyctl deploy`.

## Arquivos Criados/Modificados

| Arquivo | Ação |
|---------|------|
| `Dockerfile` | Criado — Node 20 Alpine, volume `/data`, porta 3000 |
| `server.js` | Modificado — `DATABASE_PATH` via variável de ambiente |
| `fly.toml` | Criado — App `balaio-tech`, região `gru`, volume persistente |

## URL Esperada

```
https://balaio-tech.fly.dev
```

## Comandos para Deploy

```bash
# 1. Criar app e volume no Fly.io
flyctl apps create balaio-tech
flyctl volumes create sqlite_data --region gru --size 1

# 2. Setar secret do JWT (substituir pelo valor real)
flyctl secrets set JWT_SECRET="sua-secret-segura-aqui"

# 3. Deploy
flyctl deploy

# 4. Seed do banco (após primeiro deploy)
flyctl ssh console -C "node /app/seed.js"

# 5. Verificar logs
flyctl logs
```

## Configuração

- **Região:** GRU (São Paulo)
- **Máquinas:** Mínimo 1 sempre ativa
- **Volume:** `sqlite_data` montado em `/data` (1GB)
- **Banco:** SQLite em `/data/database.db` (persistente entre deploys)
- **HTTPS:** Forçado
- **Auto-stop:** Desabilitado (site sempre disponível)

## Checklist de Verificação

- [ ] `flyctl apps create balaio-tech` executado
- [ ] `flyctl volumes create sqlite_data --region gru --size 1` executado
- [ ] `flyctl secrets set JWT_SECRET=...` configurado
- [ ] `flyctl deploy` executado com sucesso
- [ ] Site acessível em https://balaio-tech.fly.dev
- [ ] API respondendo (`/api/articles`)
- [ ] Login admin funcionando (`/api/login`)
- [ ] Seed do banco executado (`node /app/seed.js`)
- [ ] Upload de imagens funcionando (volume `/data` persistente)

## Notas

- O volume `/data` persiste entre deploys — o banco não é recriado
- Uploads de imagens ficam em `/app/public/uploads` (não persistente). Para persistir uploads, mover para `/data/uploads` e ajustar o multer
- Para escalar, considerar migrar SQLite para Turso ou LiteFS
