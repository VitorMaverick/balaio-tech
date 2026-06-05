// === BLOG SLIDER - Dados via API ===
async function initBlogSlider() {
    const wrapper = document.getElementById('blog-cards');
    if (!wrapper) return;
    try {
        const res = await fetch('/api/articles');
        const articles = await res.json();
        wrapper.innerHTML = articles.map(article => {
            const date = new Date(article.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
            const imgHtml = article.thumbnail_url
                ? `<div class="blog-card-img" style="padding:0;"><img src="${article.thumbnail_url}" alt="${article.title}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:var(--radius) var(--radius) 0 0;"></div>`
                : `<div class="blog-card-img">${(article.category_slug || '').toUpperCase()}</div>`;
            return `
            <div class="swiper-slide">
                <a href="/article/${article.slug}" class="blog-card-link-wrap" style="text-decoration:none;color:inherit;display:block;">
                <article class="blog-card">
                    ${imgHtml}
                    <div class="blog-card-body">
                        <span class="blog-card-meta">${date} • ${article.author}</span>
                        <h3 class="blog-card-title">${article.title}</h3>
                        <p class="blog-card-desc">${article.description || ''}</p>
                        <span class="blog-card-link">Ler mais →</span>
                    </div>
                </article>
                </a>
            </div>`;
        }).join('');

        if (typeof Swiper !== 'undefined') {
            new Swiper('.blog-swiper', {
                slidesPerView: 1, spaceBetween: 24,
                pagination: { el: '.swiper-pagination', clickable: true },
                navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                breakpoints: { 640: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }
            });
        }
    } catch (e) { console.error('Erro ao carregar artigos:', e); }
}

document.addEventListener('DOMContentLoaded', initBlogSlider);
