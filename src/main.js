// -----------------------------------------------------------------------------
// 主應用程式邏輯 (Main Application Logic)
// -----------------------------------------------------------------------------
import { setLanguage, t, getLang, supportedLangs, getInitialLang } from './i18n.js';

//======================================================================
// DOM 元素參考 (DOM Element References)
//======================================================================
const step1Container = document.getElementById("step1-container");
const step2Container = document.getElementById("step2-container");
const loadingContainer = document.getElementById("loading-container");
const errorContainer = document.getElementById("error-container");
const deviceButtons = document.querySelectorAll(".device-btn");
const loadingText = document.getElementById("loading-text");
const driverContainer = document.getElementById("driver-container");
const modelTitle = document.getElementById("device-model");
const exportBtn = document.getElementById("export-latest-btn");
const backBtn = document.getElementById("back-btn");
const langSelect = document.getElementById("lang-select");

//======================================================================
// 常數與應用程式狀態 (Constants & Application State)
//======================================================================
const CORS_PROXY = 'https://corsproxy.io/?';
const ASUS_BASE_URL = "https://dlcdnets.asus.com";
let driverData = null; // 用於儲存從 API 取得的驅動程式資料

//======================================================================
// UI 狀態管理 (UI State Management)
//======================================================================
/**
 * 控制應用程式的介面顯示狀態。
 * @param {'initial' | 'loading' | 'results' | 'error'} state - 要顯示的狀態。
 * @param {string} [message=""] - 在 'loading' 或 'error' 狀態下要顯示的訊息。
 */
function showState(state, message = "") {
    // 先隱藏所有主要容器
    step1Container.classList.add("hidden");
    step2Container.classList.add("hidden");
    loadingContainer.classList.add("hidden");
    errorContainer.classList.add("hidden");
    // 重設按鈕為可用狀態
    deviceButtons.forEach(btn => btn.disabled = false);

    switch (state) {
        case "initial":
            step1Container.classList.remove("hidden");
            break;
        case "loading":
            loadingContainer.classList.remove("hidden");
            deviceButtons.forEach(btn => btn.disabled = true); // 讀取時停用按鈕
            loadingText.textContent = message;
            break;
        case "results":
            step2Container.classList.remove("hidden");
            break;
        case "error":
            step1Container.classList.remove("hidden"); // 錯誤時同時顯示步驟 1，方便重試
            errorContainer.classList.remove("hidden");
            errorContainer.innerHTML = message;
            break;
    }
}

//======================================================================
// 核心邏輯 (Core Logic)
//======================================================================
/**
 * 處理從抓取到分析並顯示驅動程式的完整流程。
 * @param {string} modelSlug - 裝置的型號 slug (e.g., 'rog-ally-2023')。
 */
async function handleFetchAndAnalyze(modelSlug) {
    if (!modelSlug) {
        showState('error', t('error-no-url'));
        return;
    }

    // 為了確保參數解析的穩定性，始終從英文 (us) 頁面抓取 HTML。
    // 產品 ID (m1id) 等參數在所有語言頁面中都是相同的，但英文頁面的結構最穩定。
    // const currentLanguage = getLang();
    // const productUrl = `https://rog.asus.com/${currentLanguage}/gaming-handhelds/rog-ally/${modelSlug}/helpdesk_download/`;
    const usProductUrl = `https://rog.asus.com/us/gaming-handhelds/rog-ally/${modelSlug}/helpdesk_download/`;

    try {
        // 步驟 1: 抓取產品頁面的 HTML 原始碼 (使用穩定的英文頁面)
        showState('loading', t('loading-step1'));
        const response = await fetch(CORS_PROXY + usProductUrl);
        if (!response.ok) throw new Error(t('error-fetch-page', { status: response.status }));
        const htmlContent = await response.text();

        // 步驟 2: 從 HTML 中解析出 API 網址所需的參數
        // parseHtmlForApiUrl 內部會使用 getLang() 來確保 API 請求的是目前選擇語言的資料
        showState('loading', t('loading-step2'));
        const apiUrl = parseHtmlForApiUrl(htmlContent, modelSlug);
        if (!apiUrl) return; // 錯誤已在 parseHtmlForApiUrl 內部處理

        // 步驟 3: 使用組合好的 API 網址抓取驅動程式資料
        showState('loading', t('loading-step3'));
        const driverResponse = await fetch(CORS_PROXY + apiUrl);
        if (!driverResponse.ok) throw new Error(t('error-fetch-api', { status: driverResponse.status }));

        // API 回傳 JSON 字串，需手動解析
        const driverJson = await driverResponse.json();
        const actualData = typeof driverJson === 'string' ? JSON.parse(driverJson) : driverJson;
        driverData = actualData.Result;

        if (!driverData || !driverData.Obj || driverData.Obj.length === 0) {
            throw new Error(t('error-no-driver-data'));
        }

        // 渲染結果並切換到結果頁面
        renderDrivers(driverData);
        showState('results');
    } catch (error) {
        console.error('處理過程中發生錯誤:', error);
        showState('error', t('error-generic', { message: error.message }));
    }
}

/**
 * 解析 HTML 內容以提取建構 API 網址所需的參數。
 * @param {string} htmlContent - 產品頁面的 HTML 原始碼。
 * @param {string} modelSlug - 裝置的型號 slug。
 * @returns {string|null} 組合好的 API 網址，若失敗則返回 null。
 */
function parseHtmlForApiUrl(htmlContent, modelSlug) {
    // 內部輔助函數，用於執行正則表達式並提取匹配項
    const extractData = (regex, name) => {
        const match = htmlContent.match(regex);
        if (match && match[1]) return match[1].trim();
        console.error(`無法提取: ${name}`);
        return null;
    };

    let errors = [];
    const params = {
        model: modelSlug,
        website: getLang()
    };

    // 提取 m1id (產品 ID)，提供備用正則
    params.m1id = extractData(/data-bv-product-id="ROG_M1_(\d+)_P"/, 'm1id') || extractData(/"m1Id":(\d+),/, 'm1id (fallback)');
    if (!params.m1id) errors.push('m1id');

    // 提取 systemCode (e.g., 'rog')
    params.systemCode = extractData(/system:\s*['"]([^'"]+)['"]/, 'systemCode');
    if (!params.systemCode) errors.push('systemCode');

    if (errors.length > 0) {
        showState('error', t('error-api-params', { params: errors.join(', ') }));
        return null;
    }

    // 根據測試，cpu 和 LevelTagId 參數可以為空，這讓指令碼更具備彈性以應對網站未來變動。
    const baseUrl = "https://rog.asus.com/support/webapi/ProductV2/GetPDDrivers";
    const queryParams = new URLSearchParams({
        website: params.website,
        model: params.model,
        pdid: '0',
        m1id: params.m1id,
        mode: '',
        cpu: '', // 留空
        osid: '52', // Windows 11
        active: '',
        LevelTagId: '', // 留空
        systemCode: params.systemCode,
    });

    return `${baseUrl}?${queryParams.toString()}`;
}

//======================================================================
// 渲染邏輯 (Rendering Logic)
//======================================================================
/**
 * 根據驅動程式資料，動態生成 HTML 並渲染到頁面上。
 * @param {object} data - 從 API 取得的驅動程式資料 (driverData)。
 */
function renderDrivers(data) {
    driverContainer.innerHTML = "";
    if (data.Model) {
        modelTitle.textContent = t('device-model-title', { model: data.Model });
    }
    if (!data || !data.Obj) {
        driverContainer.innerHTML = `<p class="text-center text-red-400">${t('error-load-driver')}</p>`;
        return;
    }

    // 按分類名稱排序
    data.Obj.sort((a, b) => a.Name.localeCompare(b.Name));
    data.Obj.forEach((category) => {
        const details = document.createElement("details");
        details.className = "bg-gray-800 rounded-lg shadow-md overflow-hidden transition";

        // 在每個分類內，按發佈日期由新到舊排序檔案
        category.Files.sort((a, b) => new Date(b.ReleaseDate) - new Date(a.ReleaseDate));

        // 建立一個映射表，用於追蹤每個獨立驅動標題的最新版本 ID，以便加上"最新"標籤
        const latestForTitles = {};
        category.Files.forEach((file) => {
            if (!latestForTitles[file.Title] && !file.Version.includes("latest version")) {
                latestForTitles[file.Title] = file.Id;
            }
        });

        // 為每個檔案生成 HTML
        let filesHtml = category.Files.map((file) => {
            const downloadUrl = file.DownloadUrl.Global;
            if (!downloadUrl) return ""; // 忽略沒有下載連結的檔案

            // 組合完整的下載 URL
            const fullUrl = downloadUrl.startsWith("http") ? downloadUrl : ASUS_BASE_URL + downloadUrl;
            // 檢查是否為最新版本
            const isLatest = latestForTitles[file.Title] === file.Id;
            const latestBadge = isLatest ? `<span class="ml-2 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">${t('latest-badge')}</span>` : "";
            const highlightClass = isLatest ? "border-l-4 border-green-500 bg-gray-700/50" : "hover:bg-gray-700/50";

            return `
                <div class="border-t border-gray-700 p-4 ${highlightClass} transition-colors">
                    <div class="flex flex-col md:flex-row md:justify-between md:items-center">
                        <div class="flex-1 mb-3 md:mb-0">
                            <h4 class="font-semibold text-lg text-white flex items-center">${file.Title}${latestBadge}</h4>
                            <div class="text-sm text-gray-400 mt-1">
                                <span>${t('version')}: <strong class="font-medium text-gray-300">${file.Version}</strong></span> |
                                <span>${t('release-date')}: <strong class="font-medium text-gray-300">${file.ReleaseDate}</strong></span> |
                                <span>${t('file-size')}: <strong class="font-medium text-gray-300">${file.FileSize}</strong></span>
                            </div>
                        </div>
                        <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition text-center whitespace-nowrap">
                            ${t('download-button')}
                        </a>
                    </div>
                </div>`;
        }).join("");

        // 組合分類的完整 HTML (摺疊面板)
        details.innerHTML = `
            <summary class="p-5 cursor-pointer flex justify-between items-center">
                <div class="flex items-center">
                    <span class="font-bold text-xl text-white">${category.Name}</span>
                    <span class="ml-3 bg-gray-700 text-gray-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">${t('file-count', { count: category.Count })}</span>
                </div>
                <svg class="w-6 h-6 text-gray-400 arrow transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </summary>
            <div class="bg-gray-800/50">
                ${filesHtml}
            </div>`;
        driverContainer.appendChild(details);
    });
}

//======================================================================
// 匯出功能 (Export Logic)
//======================================================================
/**
 * 匯出所有分類中最新版本的驅動程式下載連結為一個 .txt 檔案。
 */
function exportLatestDrivers() {
    if (!driverData || !driverData.Obj) {
        // 簡易的 UI 提示
        alert(t('export-no-data'));
        return;
    }

    const allLatestDriverUrls = [];
    driverData.Obj.forEach((category) => {
        if (!category.Files || category.Files.length === 0) return;

        // 1. 按驅動程式標題分組，以便找出每個獨立驅動的最新版
        const driversByTitle = {};
        category.Files.forEach((file) => {
            if (!file.DownloadUrl || !file.DownloadUrl.Global) return;
            if (!driversByTitle[file.Title]) driversByTitle[file.Title] = [];
            driversByTitle[file.Title].push(file);
        });

        // 2. 在每個分組中找出最新版本
        for (const title in driversByTitle) {
            const fileGroup = driversByTitle[title];
            if (fileGroup.length === 0) continue;

            // 排除佔位符版本
            const versionedFiles = fileGroup.filter((f) => !f.Version.includes("latest version"));
            // 如果有帶版本號的檔案，則從中找出日期最新的。否則，直接取分組中的第一個檔案。
            let latestFile = versionedFiles.length > 0
                ? versionedFiles.reduce((latest, current) => new Date(current.ReleaseDate) > new Date(latest.ReleaseDate) ? current : latest)
                : fileGroup[0];

            if (latestFile) {
                const downloadUrl = latestFile.DownloadUrl.Global;
                const fullUrl = downloadUrl.startsWith("http") ? downloadUrl : ASUS_BASE_URL + downloadUrl;
                allLatestDriverUrls.push(fullUrl);
            }
        }
    });

    if (allLatestDriverUrls.length === 0) {
        // 簡易的 UI 提示
        alert(t('export-no-links'));
        return;
    }

    const textContent = allLatestDriverUrls.join("\n");
    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `latest_drivers_${driverData.Model.replace(/ /g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

//======================================================================
// 初始化與事件監聽器 (Initialization & Event Listeners)
//======================================================================
/**
 * 初始化應用程式、語言設定和事件監聽。
 */
function initializeApp() {
    // 根據瀏覽器設定初始語言
    const initialLang = getInitialLang();

    // 填滿語言下拉選單
    langSelect.innerHTML = Object.entries(supportedLangs)
        .map(([code, name]) => `<option value="${code}" ${code === initialLang ? 'selected' : ''}>${name}</option>`)
        .join('');

    // 設定初始語言
    setLanguage(initialLang);

    // 綁定事件
    deviceButtons.forEach(btn => {
        btn.addEventListener("click", () => handleFetchAndAnalyze(btn.dataset.modelSlug));
    });

    // 匯出按鈕事件
    exportBtn.addEventListener("click", exportLatestDrivers);
    // 返回按鈕事件，回到初始畫面
    backBtn.addEventListener("click", () => showState("initial"));

    langSelect.addEventListener('change', (e) => {
        setLanguage(e.target.value);
    });
}

// 應用程式進入點
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});