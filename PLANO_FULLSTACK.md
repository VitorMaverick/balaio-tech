# PLANO_FULLSTACK.md — Balaio.tech Blog

## Stack Escolhida

| Camada | Tecnologia | Justificativa |
|--------|-----------|---------------|
| Backend | Express.js | Leve, familiar, sem overhead de framework |
| Banco | SQLite (better-sqlite3) | Zero config, arquivo único, perfeito para blog pessoal |
| Frontend | HTML/CSS/JS puro (mantido) | Preservar design existente, consumir API via fetch |
| Auth | Senha simples com JWT | Proteger endpoints de escrita |

## Arquitetura

```
Browser (HTML/CSS/JS)
    ↕ fetch('/api/...')
Express Server (porta 3000)
    ↕ better-sqlite3
SQLite (database.db)
```

## Schema do Banco

```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT
);

CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  category_slug TEXT NOT NULL,
  author TEXT DEFAULT 'Maverick Dev',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (category_slug) REFERENCES categories(slug)
);
```

## Estrutura de Diretórios

```
ctrl-s/
├── server.js              ← Express server + API
├── database.db            ← SQLite (gerado)
├── seed.js                ← Script de migração dos artigos
├── package.json
├── .env
├── public/                ← Frontend estático (servido pelo Express)
│   ├── index.html
│   ├── admin.html
│   ├── article.html       ← Template dinâmico de artigo
│   └── assets/
│       ├── css/
│       ├── js/
│       └── images/
└── PLANO_FULLSTACK.md
```

## Plano de Migração

1. Mover frontend existente para `public/`
2. Extrair conteúdo HTML dos 10 artigos (div.article-content)
3. Inserir no banco via seed.js
4. Criar `article.html` como template que carrega conteúdo via API
5. Adaptar `script.js` e `blog-slider.js` para consumir API
6. Criar rota catch-all para paths antigos redirecionarem
