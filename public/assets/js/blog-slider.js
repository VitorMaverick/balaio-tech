// === BLOG SLIDER - Dados via API ===
async function initBlogSlider() {
    const wrapper = document.getElementById('blog-cards');
    if (!wrapper) return;
    try {
        const res = await fetch('/api/articles');
        const articles = await res.json();
        wrapper.innerHTML = articles.map(article => {
            const date = new Date(article.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
            return `
            <div class="swiper-slide">
                <article class="blog-card">
                    <div class="blog-card-img">${(article.category_slug || '').toUpperCase()}</div>
                    <div class="blog-card-body">
                        <span class="blog-card-meta">${date} • ${article.author}</span>
                        <h3 class="blog-card-title">${article.title}</h3>
                        <p class="blog-card-desc">${article.description || ''}</p>
                        <a href="/article/${article.slug}" class="blog-card-link">Ler mais →</a>
                    </div>
                </article>
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
