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
const versionElement = document.getElementById("app-version");

//======================================================================
// 常數與應用程式狀態 (Constants & Application State)
//======================================================================
// 使用 corsproxy.io 代理 ASUS API 請求 (繞過瀏覽器 CORS 限制)。
// 註：免費公開 proxy 對大回應會回 413 (已實測：Xbox Ally (2025) 驅動清單 1.39MB 觸發 413)，
//     且速度/穩定性不保證。故該機型暫時隱藏 (見 index.html)；
//     長遠正解是改由 GitHub Actions 預抓成同源靜態 JSON (繞開 proxy 限制)。
const CORS_PROXY = 'https://corsproxy.io/?';
const ASUS_BASE_URL = "https://dlcdnets.asus.com";
const SYSTEM_CODE = 'rog'; // ROG 產品線的固定識別碼，四款機型皆相同
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
 * 處理從查詢產品資訊到顯示驅動程式的完整流程。
 *
 * 不再抓取產品頁 HTML 並用正則表達式刮取不穩定的參數，而是改為呼叫 ASUS 前端
 * 自己使用的結構化 JSON API，動態組合出驅動程式 API 網址：
 *   1. Route API   → 取得 m1Id、levelTagId、webPathName (正確大小寫的 model)
 *   2. CPUName API → 取得 cpu (舊機型有值、新機型回空)
 *   3. GetPDDrivers → 用上述參數抓取驅動程式清單
 * 這讓流程不受頁面排版變動影響。
 *
 * @param {string} modelSlug - 裝置的型號 slug (e.g., 'rog-ally-2023')。
 */
async function handleFetchAndAnalyze(modelSlug) {
    if (!modelSlug) {
        showState('error', t('error-no-url'));
        return;
    }

    try {
        // 步驟 1: 查詢產品路由資訊，取得 m1Id / levelTagId / 正確的 model 名稱
        showState('loading', t('loading-step1'));
        const route = await fetchProductRoute(modelSlug);
        if (!route) return; // 錯誤已在 fetchProductRoute 內部處理

        // 步驟 2: 查詢 CPU 名稱 (舊機型需要、新機型回空字串)
        showState('loading', t('loading-step2'));
        const cpu = await fetchCpuName(route.model, route.m1id);

        // 步驟 3: 組合 API 網址並抓取驅動程式資料
        showState('loading', t('loading-step3'));
        const apiUrl = buildDriversApiUrl({ ...route, cpu });
        const driverResponse = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
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
 * 透過 ASUS Route API 取得產品的核心識別參數。
 * 回傳結構化 JSON，不必再從 HTML 刮取不穩定的值。
 * @param {string} modelSlug - 裝置的型號 slug。
 * @returns {Promise<{m1id:string, levelTagId:string, model:string}|null>}
 */
async function fetchProductRoute(modelSlug) {
    // model 與 m1Id 等識別資訊在所有語言下皆相同，固定用 us 路徑查詢最穩定。
    const webUrl = `us/gaming-handhelds/rog-ally/${modelSlug}/helpdesk_download/`;
    const routeUrl = `https://api-rog.asus.com/recent-data/api/v3/Route`
        + `?WebURL=${encodeURIComponent(webUrl)}&systemCode=${SYSTEM_CODE}`;

    const response = await fetch(CORS_PROXY + encodeURIComponent(routeUrl));
    if (!response.ok) throw new Error(t('error-fetch-page', { status: response.status }));

    const json = await response.json();
    const result = (typeof json === 'string' ? JSON.parse(json) : json).result;

    // 校驗組合 API 網址所需的必要參數
    const errors = [];
    if (!result || !result.m1Id) errors.push('m1id');
    if (!result || !result.levelTagId) errors.push('LevelTagId');
    if (!result || !result.webPathName) errors.push('model');
    if (errors.length > 0) {
        showState('error', t('error-api-params', { params: errors.join(', ') }));
        return null;
    }

    return {
        m1id: String(result.m1Id),
        levelTagId: String(result.levelTagId),
        // webPathName 帶有正確大小寫 (新機型為 'ROG-XBOX-Ally-2025')，直接沿用最可靠。
        model: result.webPathName,
    };
}

/**
 * 查詢機型對應的 CPU 名稱。舊機型 (如 RC72LA) 有值，新機型回空字串。
 * 此參數對 GetPDDrivers 而言可有可無，失敗時退回空字串不中斷流程。
 * @param {string} model - 正確大小寫的 model 名稱。
 * @param {string} m1id - 產品 ID。
 * @returns {Promise<string>} CPU 名稱，無則回空字串。
 */
async function fetchCpuName(model, m1id) {
    try {
        const cpuUrl = `https://rog.asus.com/support/webapi/product/GetPDCPUName`
            + `?website=us&model=${encodeURIComponent(model)}&pdid=0&m1id=${m1id}&systemCode=${SYSTEM_CODE}`;
        const response = await fetch(CORS_PROXY + encodeURIComponent(cpuUrl));
        if (!response.ok) return '';

        const json = await response.json();
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const result = data.Result ?? data.result ?? data;
        // 回傳形如 { Name: "RC72LA" }，或陣列；容錯取出第一個名稱。
        if (Array.isArray(result)) return result[0]?.Name ?? '';
        return result?.Name ?? '';
    } catch (_) {
        return ''; // CPU 名稱非必要，查不到就留空
    }
}

/**
 * 用取得的參數組合 GetPDDrivers API 網址。
 * @param {{website?:string, model:string, m1id:string, levelTagId:string, cpu:string}} params
 * @returns {string} 組合好的 API 網址。
 */
function buildDriversApiUrl(params) {
    const baseUrl = "https://rog.asus.com/support/webapi/ProductV2/GetPDDrivers";
    const queryParams = new URLSearchParams({
        website: getLang(), // 驅動清單的語言跟隨目前選擇的介面語言
        model: params.model,
        pdid: '0',
        m1id: params.m1id,
        mode: '',
        cpu: params.cpu || '',
        osid: '52', // Windows 11
        active: '',
        LevelTagId: params.levelTagId,
        systemCode: SYSTEM_CODE,
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
        details.className = "group bg-gray-800 rounded-lg shadow-md overflow-hidden transition";

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
            <summary class="p-5 cursor-pointer flex justify-between items-center list-none">
                <div class="flex items-center">
                    <span class="font-bold text-xl text-white">${category.Name}</span>
                    <span class="ml-3 bg-gray-700 text-gray-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">${t('file-count', { count: category.Count })}</span>
                </div>
                <svg class="w-6 h-6 text-gray-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
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
    // 從 Vite 環境變數取得版本號
    const appVersion = import.meta.env.APP_VERSION;

    // 根據目前語言更新版本號文字的函式
    const updateVersionText = () => {
        if (versionElement && appVersion) {
            versionElement.textContent = t('app-version', { version: appVersion });
        }
    };

    // 根據瀏覽器設定初始語言
    const initialLang = getInitialLang();

    // 填滿語言下拉選單
    langSelect.innerHTML = Object.entries(supportedLangs)
        .map(([code, name]) => `<option value="${code}" ${code === initialLang ? 'selected' : ''}>${name}</option>`)
        .join('');

    // 設定初始語言並更新 UI
    setLanguage(initialLang);
    updateVersionText();

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
        updateVersionText(); // 切換語言時也要更新版本號文字
    });
}

// 應用程式進入點
document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});