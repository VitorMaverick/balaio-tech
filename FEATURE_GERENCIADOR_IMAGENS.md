# Feature: Gerenciador Completo de Imagens

**Data:** 2026-06-05  
**Status:** ✅ COMPLETO — 10/10 testes passaram

## Checklist de Etapas

| Etapa | Descrição | Status |
|-------|-----------|--------|
| 1 | Tabela `images` + node-cron instalado | ✅ |
| 2 | POST /api/upload insere no banco + retorna {url, id} | ✅ |
| 3 | GET /api/images + DELETE /api/images/:id | ✅ |
| 4 | DELETE artigo limpa imagens associadas | ✅ |
| 5 | Galeria no admin (thumbnails, inserir, excluir, upload) | ✅ |
| 6 | cleanup.js + cron mensal + endpoint + botão admin | ✅ |

## Arquivos Modificados/Criados

| Arquivo | Ação |
|---------|------|
| `server.js` | Upload com tabela images, GET/DELETE imagens, cleanup endpoint, cron |
| `cleanup.js` | **NOVO** — Script de limpeza de imagens órfãs |
| `public/admin.html` | Galeria com thumbnails, botões Inserir/Excluir, botão cleanup |
| `package.json` | Script `npm run cleanup`, dep node-cron |
| `database.db` | Tabela `images` adicionada |

## Schema: Tabela images

```sql
CREATE TABLE images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_slug TEXT,          -- NULL = imagem sem post específico
  url TEXT NOT NULL,          -- /uploads/nome.ext
  filename TEXT NOT NULL,     -- nome no disco
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (article_slug) REFERENCES articles(slug) ON DELETE SET NULL
);
```

## Endpoints de Imagem

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/upload | Upload (aceita `article_slug` no FormData) → {url, id} |
| GET | /api/images | Listar (filtro opcional `?article_slug=`) |
| DELETE | /api/images/:id | Excluir imagem (disco + banco) |
| POST | /api/admin/cleanup | Limpeza manual de órfãs |

## Cleanup (3 verificações)
1. Arquivos no disco sem registro no banco → remove do disco
2. Registros no banco sem arquivo em disco → remove do banco
3. Imagens de artigos que foram deletados → remove disco + banco

**Agendamento:** Dia 1 de cada mês às 3h (cron)  
**Manual:** `npm run cleanup` ou botão no admin

## Testes Realizados

| # | Teste | Resultado |
|---|-------|-----------|
| 1 | Login com bcrypt | ✓ |
| 2 | Upload com article_slug retorna {url, id} | ✓ |
| 3 | Upload sem slug (NULL) funciona | ✓ |
| 4 | GET /api/images lista todas | ✓ |
| 5 | GET /api/images?article_slug filtra | ✓ |
| 6 | DELETE /api/images/:id remove registro | ✓ |
| 7 | Arquivo deletado do disco | ✓ |
| 8 | POST /api/admin/cleanup funciona | ✓ |
| 9 | cleanup.js standalone funciona | ✓ |
| 10 | Server roda sem erros | ✓ |
