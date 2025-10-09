// -----------------------------------------------------------------------------
// 多國語言翻譯模組 (i18n Module)
// -----------------------------------------------------------------------------
import usTranslations from './locales/us.json';
import twTranslations from './locales/tw.json';

// 支援的語言清單
export const supportedLangs = {
    us: 'English',
    tw: '繁體中文'
};

// 在建置時就將所有翻譯載入記憶體
const allTranslations = {
    us: usTranslations,
    tw: twTranslations,
};

let currentLang = 'us'; // 預設語言
let translations = {};  // 儲存目前語言的翻譯文字

/**
 * 從記憶體中載入指定語言的翻譯。
 * @param {string} lang - 語言代碼 (例如 'us', 'tw')。
 */
function loadTranslations(lang) {
    translations = allTranslations[lang] || allTranslations['us']; // 當找不到對應語言時，使用 'us'
}

/**
 * 根據 Key 取得對應的翻譯文字，並替換變數。
 * @param {string} key - 翻譯的 Key。
 * @param {Object.<string, string|number>} [replaces] - 要替換的佔位符物件。
 * @returns {string} 翻譯後的文字。
 */
export function t(key, replaces) {
    let text = translations[key] || allTranslations['us'][key] || key; // 當找不到翻譯 key 時，備援到 'us'
    if (replaces) {
        for (const [placeholder, value] of Object.entries(replaces)) {
            text = text.replace(new RegExp(`{{${placeholder}}}`, 'g'), value);
        }
    }
    return text;
}

/**
 * 設定並套用指定的語言 (同步執行)。
 * @param {'us' | 'tw'} lang - 要設定的語言。
 */
export function setLanguage(lang) {
    if (supportedLangs[lang]) {
        currentLang = lang;
        loadTranslations(lang); // 直接從記憶體切換，不再是異步操作
        updateUI();
    }
}

/**
 * 取得目前設定的語言。
 * @returns {string} 目前的語言代碼。
 */
export function getLang() {
    return currentLang;
}

/**
 * 更新整個頁面的 UI 文字。
 */
function updateUI() {
    document.documentElement.lang = t('lang-html');
    document.title = t('app-title');

    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(key);
    });
}

/**
 * 根據瀏覽器設定決定初始語言。
 * @returns {string} 初始語言代碼。
 */
export function getInitialLang() {
    const browserLang = navigator.language.toLowerCase();
    if (browserLang.startsWith("zh")) {
        return "tw";
    }
    if (browserLang.startsWith("en")) {
        return "us";
    }
    // 當瀏覽器語言都不是中英文時，預設為 'us'
    return 'us';
}