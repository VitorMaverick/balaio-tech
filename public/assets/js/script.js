// === CATEGORIAS VIA API ===
async function populateCategories() {
    const dropdown = document.getElementById('categories-dropdown');
    if (!dropdown) return;
    try {
        const res = await fetch('/api/categories');
        const categories = await res.json();
        dropdown.innerHTML = categories.map(cat =>
            `<li><a href="/technologies/${cat.slug}/">${cat.icon} ${cat.name}</a></li>`
        ).join('');
    } catch (e) { console.error('Erro ao carregar categorias:', e); }
}

// === THEME TOGGLE ===
function initTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

// === HAMBURGER MENU ===
function initHamburger() {
    const btn = document.getElementById('hamburger');
    const nav = document.getElementById('nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        nav.classList.toggle('active');
    });
    nav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => { btn.classList.remove('active'); nav.classList.remove('active'); });
    });
    const dropdownToggle = nav.querySelector('.nav-dropdown');
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', () => {
            if (window.innerWidth <= 768) dropdownToggle.classList.toggle('active');
        });
    }
}

// === BACK TO TOP ===
function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;
    window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 400));
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// === SCROLL SPY ===
function initScrollSpy() {
    const sections = document.querySelectorAll('section[id]');
    const links = document.querySelectorAll('.nav-link');
    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(s => { if (window.scrollY >= s.offsetTop - 100) current = s.getAttribute('id'); });
        links.forEach(l => {
            l.classList.remove('active');
            if (l.getAttribute('href') === '#' + current) l.classList.add('active');
        });
    });
}

// === TYPED.JS ===
function initTyped() {
    if (document.getElementById('typed-output') && typeof Typed !== 'undefined') {
        new Typed('#typed-output', {
            strings: ['Hello World!', 'Tecnologia e cultura', 'Aprendizado em público', 'O balaio do conhecimento'],
            typeSpeed: 50, backSpeed: 30, backDelay: 2000, loop: true
        });
    }
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
    populateCategories();
    initTheme();
    initHamburger();
    initBackToTop();
    initScrollSpy();
    initTyped();
});
