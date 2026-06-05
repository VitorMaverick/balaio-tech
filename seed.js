const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');

// Schema
db.exec(`
  DROP TABLE IF EXISTS articles;
  DROP TABLE IF EXISTS categories;

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
    created_at TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_slug) REFERENCES categories(slug)
  );
`);

// Seed categorias
const categories = [
  { name: 'Web', slug: 'web', icon: '🌐' },
  { name: 'Back-end', slug: 'back-end', icon: '⚙️' },
  { name: 'Banco de Dados', slug: 'banco-de-dados', icon: '🗃️' },
  { name: 'Ferramentas', slug: 'ferramentas', icon: '🔧' },
  { name: 'Projetos', slug: 'projetos', icon: '🚀' },
  { name: 'Carreira', slug: 'carreira', icon: '💡' },
  { name: 'Tutoriais', slug: 'tutoriais', icon: '📝' },
  { name: 'Arquivo', slug: 'arquivo', icon: '📂' }
];

const insertCat = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
categories.forEach(c => insertCat.run(c.name, c.slug, c.icon));

// Seed artigos — extrair conteúdo dos HTML existentes
const articles = [
  { title: 'Sobre este blog', slug: 'sobre-este-blog', desc: 'Por que criei o Balaio.tech e o que espero compartilhar por aqui.', category: 'arquivo', date: '2024-11-10', path: 'technologies/arquivo/articles/sobre-este-blog/index.html' },
  { title: 'O que aprendi no meu primeiro mês estudando programação', slug: 'primeiro-mes-programacao', desc: 'Erros, descobertas e aquele momento em que o código roda pela primeira vez.', category: 'carreira', date: '2024-11-15', path: 'technologies/carreira/articles/primeiro-mes-programacao/index.html' },
  { title: 'Como organizar seus estudos de tecnologia', slug: 'organizar-estudos', desc: 'Meu método prático pra não me perder entre cursos, projetos e anotações.', category: 'carreira', date: '2024-11-22', path: 'technologies/carreira/articles/organizar-estudos/index.html' },
  { title: 'Entendendo Flexbox de uma vez por todas', slug: 'entendendo-flexbox', desc: 'Guia prático com exemplos reais pra parar de sofrer com layout CSS.', category: 'web', date: '2024-12-01', path: 'technologies/web/articles/entendendo-flexbox/index.html' },
  { title: 'Minha primeira API REST: o que aprendi', slug: 'primeira-api-rest', desc: 'Do zero ao primeiro endpoint funcionando — erros inclusos.', category: 'back-end', date: '2024-12-10', path: 'technologies/back-end/articles/primeira-api-rest/index.html' },
  { title: 'Comandos Git que uso todo dia', slug: 'comandos-git', desc: 'Os comandos que mais uso no dia a dia e quando usar cada um.', category: 'ferramentas', date: '2024-12-18', path: 'technologies/ferramentas/articles/comandos-git/index.html' },
  { title: 'Modelagem de banco de dados: o básico que funciona', slug: 'modelagem-banco', desc: 'Entendendo entidades, relacionamentos e como pensar antes de criar tabelas.', category: 'banco-de-dados', date: '2025-01-05', path: 'technologies/banco-de-dados/articles/modelagem-banco/index.html' },
  { title: 'Como configurei meu ambiente de desenvolvimento', slug: 'ambiente-desenvolvimento', desc: 'VS Code, terminal, extensões e tudo que uso pra codar no dia a dia.', category: 'ferramentas', date: '2025-01-14', path: 'technologies/ferramentas/articles/ambiente-desenvolvimento/index.html' },
  { title: 'Reflexão: antes de ser programador, você é um profissional', slug: 'profissional-antes-programador', desc: 'Sobre soft skills, postura e coisas que nenhum curso ensina.', category: 'carreira', date: '2025-01-25', path: 'technologies/carreira/articles/profissional-antes-programador/index.html' },
  { title: 'Tutorial: criando um site pessoal do zero', slug: 'site-pessoal-do-zero', desc: 'Passo a passo completo com HTML, CSS e um toque de JavaScript.', category: 'tutoriais', date: '2025-02-03', path: 'technologies/tutoriais/articles/site-pessoal-do-zero/index.html' }
];

const insertArt = db.prepare('INSERT INTO articles (title, slug, description, content, category_slug, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');

articles.forEach(a => {
  const filePath = path.join(__dirname, 'public', a.path);
  let content = '';
  if (fs.existsSync(filePath)) {
    const html = fs.readFileSync(filePath, 'utf-8');
    // Extrair conteúdo entre <div class="article-content"> e seu fechamento
    const match = html.match(/<div class="article-content">([\s\S]*?)<\/div>\s*<a href/);
    content = match ? match[1].trim() : html;
  }
  insertArt.run(a.title, a.slug, a.desc, content, a.category, 'Maverick Dev', a.date);
});

console.log(`✓ ${categories.length} categorias inseridas`);
console.log(`✓ ${articles.length} artigos inseridos`);
db.close();
