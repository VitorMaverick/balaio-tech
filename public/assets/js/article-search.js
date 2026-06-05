// === ARTICLE SEARCH — Balaio.tech ===
document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.querySelector('.article-search-input');
  const clearButton = document.querySelector('.article-search-clear');
  const emptyMessage = document.querySelector('.article-search-empty');
  const articlesGrid = document.getElementById('articles-grid');
  const categorySlug = document.body.dataset.category;

  if (!articlesGrid || !categorySlug) return;

  // Carregar artigos da API
  let categoryArticles = [];
  try {
    const url = categorySlug === 'arquivo' ? '/api/articles' : `/api/articles?category=${categorySlug}`;
    const res = await fetch(url);
    categoryArticles = await res.json();
  } catch (e) { console.error('Erro ao carregar artigos:', e); }

  function renderArticles(list) {
    if (list.length === 0) {
      articlesGrid.innerHTML = '';
      if (emptyMessage) emptyMessage.hidden = false;
      return;
    }
    if (emptyMessage) emptyMessage.hidden = true;
    articlesGrid.innerHTML = list.map(a => {
      const date = new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
      <article class="blog-card">
        <div class="blog-card-img">${(a.category_slug || '').toUpperCase()}</div>
        <div class="blog-card-body">
          <span class="blog-card-meta">${date} • ${a.author}</span>
          <h3 class="blog-card-title">${a.title}</h3>
          <p class="blog-card-desc">${a.description || ''}</p>
          <a href="/article/${a.slug}" class="blog-card-link">Ler mais →</a>
        </div>
      </article>`;
    }).join('');
  }

  renderArticles(categoryArticles);

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (clearButton) clearButton.hidden = query === '';
      const filtered = query === '' ? categoryArticles : categoryArticles.filter(a => a.title.toLowerCase().includes(query));
      renderArticles(filtered);
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      clearButton.hidden = true;
      renderArticles(categoryArticles);
      searchInput.focus();
    });
  }
});
