/*
* 在 HTML 中使用 <span data-i18n="app.title"></span>
* 在 JS 中使用 I18n.t('buttons.back')
*/


(function () {
    const DEFAULT_LANG = 'zh-TW';
    const STORAGE_KEY = 'app.lang';
    const SUPPORTED = ['zh-TW', 'en-US', 'ja-JP'];

    let currentLang = DEFAULT_LANG;
    let dict = {};

    function getInitialLang() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved && SUPPORTED.includes(saved)) return saved;
        const nav = (navigator.language || navigator.userLanguage || '').trim();
        if (nav.toLowerCase().startsWith('zh')) return 'zh-TW';
        return 'en-US';
    }

    async function loadDict(lang) {
        const res = await fetch(`/locales/${lang}.json`);
        if (!res.ok) throw new Error(`Failed to load locales: ${lang}`);
        dict = await res.json();
    }

    function interpolate(template, params) {
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (_, k) => (
            Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`
        ));
    }

    function resolveKey(path) {
        const parts = path.split('.');
        let cur = dict;
        for (const p of parts) {
            if (cur && typeof cur === 'object' && p in cur) {
                cur = cur[p];
            } else {
                return null;
            }
        }
        return typeof cur === 'string' ? cur : null;
    }

    function t(key, params) {
        const found = resolveKey(key);
        if (found == null) return key;
        return interpolate(found, params);
    }

    function applyToDom(root = document) {
        const nodes = root.querySelectorAll('[data-i18n]');
        nodes.forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const text = t(key);
            el.textContent = text;
        });

        const attrNodes = root.querySelectorAll('[data-i18n-attr]');
        attrNodes.forEach((el) => {
            const spec = el.getAttribute('data-i18n-attr');
            const [attr, key] = spec.split(':');
            const text = t(key);
            if (attr && text != null) el.setAttribute(attr, text);
        });
    }

    async function setLang(lang) {
        if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
        currentLang = lang;
        localStorage.setItem(STORAGE_KEY, currentLang);
        await loadDict(currentLang);
        applyToDom();
        document.documentElement.lang = currentLang === 'zh-TW' ? 'zh-Hant' : 'en';
        document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: currentLang } }));
    }

    async function init() {
        const initial = getInitialLang();
        await setLang(initial);
        const selector = document.getElementById('lang-select');
        if (selector) selector.value = currentLang;
    }

    window.I18n = {
        init,
        setLang,
        t,
        get lang() { return currentLang; }
    };
})();


