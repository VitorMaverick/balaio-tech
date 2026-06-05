# Feature: Upload de Imagens nos Posts

**Data:** 2026-06-05  
**Status:** ✅ OK

## 1. Decisão de arquitetura
**Opção A — Imagens em disco + path no conteúdo.**  
Upload salva em `public/uploads/`, Express serve via static. O conteúdo HTML do artigo contém `<img src="/uploads/...">` que renderiza automaticamente.

## 2. Arquivos modificados/criados

| Arquivo | Ação |
|---------|------|
| `server.js` | Adicionado multer + POST /api/upload (protegido por JWT) |
| `public/admin.html` | Botão "Inserir imagem" + upload via fetch + inserção no cursor |
| `public/assets/css/main.css` | Estilo `.article-content img` responsivo |
| `public/uploads/` | Pasta criada para armazenar imagens |
| `package.json` | Dependência multer adicionada |

## 3. Como funciona
1. No painel admin, o autor clica em "🖼️ Inserir imagem"
2. Seleciona um arquivo (jpg/png/webp/gif, máx 5MB)
3. Imagem é enviada via fetch POST /api/upload com token JWT
4. Server salva em `public/uploads/` com nome único (timestamp + hash)
5. Retorna `{ url: "/uploads/nome.ext" }`
6. Tag `<img src="/uploads/nome.ext" alt="..." />` é inserida na posição do cursor no textarea
7. Ao salvar o artigo, o HTML com a imagem é persistido no banco
8. No frontend, `article.html` renderiza via innerHTML — imagens aparecem automaticamente

## 4. Testes realizados

| Teste | Resultado |
|-------|-----------|
| Login para obter token | ✓ |
| Upload sem auth retorna 401 | ✓ |
| Upload com auth retorna 200 + URL | ✓ |
| Arquivo salvo em disco | ✓ |
| Imagem acessível via HTTP | ✓ |
| CSS renderiza imagem responsiva | ✓ |

## 5. Validações de segurança
- Apenas extensões permitidas: .jpg, .jpeg, .png, .webp, .gif
- Tamanho máximo: 5MB
- Endpoint protegido por JWT (somente admin logado)
