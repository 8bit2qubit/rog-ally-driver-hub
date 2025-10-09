// 確保 DOM 完全載入後再執行指令碼
document.addEventListener("DOMContentLoaded", () => {
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

    //======================================================================
    // 常數與應用程式狀態 (Constants & Application State)
    //======================================================================
    const CORS_PROXY = 'https://corsproxy.io/?';
    const ASUS_BASE_URL = "https://dlcdnets.asus.com";
    let driverData = null; // 用於儲存從 API 取得的驅動程式資料

    //======================================================================
    // 事件監聽器 (Event Listeners)
    //======================================================================
    // 為每個裝置按鈕綁定點選事件，觸發資料抓取
    deviceButtons.forEach(btn => {
        btn.addEventListener("click", () => handleFetchAndAnalyze(btn.dataset.url));
    });
    // 匯出按鈕事件
    exportBtn.addEventListener("click", exportLatestDrivers);
    // 返回按鈕事件，回到初始畫面
    backBtn.addEventListener("click", () => showState("initial"));

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
                deviceButtons.forEach(btn => btn.disabled = true); // 讀取時禁用按鈕
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
     * @param {string} productUrl - 裝置的官方支援頁面網址。
     */
    async function handleFetchAndAnalyze(productUrl) {
        if (!productUrl) {
            showState('error', '發生內部錯誤：找不到產品網址。');
            return;
        }
        try {
            // 步驟 1: 抓取產品頁面的 HTML 原始碼
            showState('loading', '步驟 1/3: 正在抓取產品頁面原始碼...');
            const response = await fetch(CORS_PROXY + productUrl);
            if (!response.ok) throw new Error(`無法抓取產品頁面，伺服器回應: ${response.status}`);
            const htmlContent = await response.text();

            // 步驟 2: 從 HTML 中解析出 API 網址所需的參數
            showState('loading', '步驟 2/3: 正在分析頁面並產生 API 網址...');
            const apiUrl = parseHtmlForApiUrl(htmlContent);
            if (!apiUrl) return; // 錯誤已在 parseHtmlForApiUrl 內部處理

            // 步驟 3: 使用組合好的 API 網址抓取驅動程式資料
            showState('loading', '步驟 3/3: 正在從 API 擷取驅動程式資料...');
            const driverResponse = await fetch(CORS_PROXY + apiUrl);
            if (!driverResponse.ok) throw new Error(`無法從 ASUS API 取得驅動程式資料，伺服器回應: ${driverResponse.status}`);

            // API 可能回傳 JSON 字串，需手動解析
            const driverJson = await driverResponse.json();
            const actualData = typeof driverJson === 'string' ? JSON.parse(driverJson) : driverJson;
            driverData = actualData.Result;

            if (!driverData || !driverData.Obj || driverData.Obj.length === 0) {
                throw new Error("API 成功回應，但未包含任何有效的驅動程式資料。");
            }

            // 渲染結果並切換到結果頁面
            renderDrivers(driverData);
            showState('results');
        } catch (error) {
            console.error('處理過程中發生錯誤:', error);
            showState('error', `發生錯誤：<br>${error.message}。<br><br>請檢查網址是否正確，或稍後再試。有時代理伺服器可能會不穩定。`);
        }
    }

    /**
     * 解析 HTML 內容以提取建構 API 網址所需的參數。
     * @param {string} htmlContent - 產品頁面的 HTML 原始碼。
     * @returns {string|null} 組合好的 API 網址，若失敗則返回 null。
     */
    function parseHtmlForApiUrl(htmlContent) {
        // 內部輔助函數，用於執行正則表達式並提取匹配項
        const extractData = (regex, name) => {
            const match = htmlContent.match(regex);
            if (match && match[1]) return match[1].trim();
            console.error(`無法提取: ${name}`);
            return null;
        };

        let errors = [];
        const params = {};

        // 提取 website 參數 (e.g., 'tw')
        params.website = extractData(/websitePath:\s*['"]([^'"]+)['"]/, 'website');
        if (!params.website) errors.push('website');

        // 提取 model 名稱 (e.g., 'rog-ally-2023')
        params.model = extractData(/og:url"\s*content="https?:\/\/rog\.asus\.com\/[^\/]+\/[^\/]+\/[^\/]+\/([^\/]+)\//, 'model');
        if (!params.model) errors.push('model');

        // 提取 m1id (產品 ID)，提供備用正則
        params.m1id = extractData(/data-bv-product-id="ROG_M1_(\d+)_P"/, 'm1id');
        if (!params.m1id) {
            params.m1id = extractData(/"m1Id":(\d+),/, 'm1id (fallback)');
        }
        if (!params.m1id) errors.push('m1id');

        // 提取 systemCode (e.g., 'rog')
        params.systemCode = extractData(/system:\s*['"]([^'"]+)['"]/, 'systemCode');
        if (!params.systemCode) errors.push('systemCode');

        if (errors.length > 0) {
            showState('error', `<strong>無法組合 API 網址。</strong><br>缺少以下必要參數：${errors.join(', ')}。`);
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
            modelTitle.textContent = `${data.Model} - 驅動程式`;
        }
        if (!data || !data.Obj) {
            driverContainer.innerHTML =
                '<p class="text-center text-red-400">無法載入驅動程式資料。</p>';
            return;
        }

        // 按分類名稱排序
        data.Obj.sort((a, b) => a.Name.localeCompare(b.Name));
        data.Obj.forEach((category) => {
            const details = document.createElement("details");
            details.className =
                "bg-gray-800 rounded-lg shadow-md overflow-hidden transition";

            // 在每個分類內，按發佈日期由新到舊排序檔案
            category.Files.sort(
                (a, b) => new Date(b.ReleaseDate) - new Date(a.ReleaseDate)
            );

            // 建立一個映射表，用於追蹤每個獨立驅動標題的最新版本 ID，以便加上"最新"標籤
            const latestForTitles = {};
            category.Files.forEach((file) => {
                if (
                    !latestForTitles[file.Title] &&
                    !file.Version.includes("latest version")
                ) {
                    latestForTitles[file.Title] = file.Id;
                }
            });

            // 為每個檔案生成 HTML
            let filesHtml = category.Files.map((file) => {
                const downloadUrl = file.DownloadUrl.Global;
                if (!downloadUrl) return ""; // 忽略沒有下載連結的檔案

                // 組合完整的下載 URL
                const fullUrl = downloadUrl.startsWith("http")
                    ? downloadUrl
                    : ASUS_BASE_URL + downloadUrl;

                // 檢查是否為最新版本
                const isLatest = latestForTitles[file.Title] === file.Id;
                const latestBadge = isLatest
                    ? `<span class="ml-2 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">最新</span>`
                    : "";
                const highlightClass = isLatest
                    ? "border-l-4 border-green-500 bg-gray-700/50"
                    : "hover:bg-gray-700/50";

                return `
                            <div class="border-t border-gray-700 p-4 ${highlightClass} transition-colors">
                                <div class="flex flex-col md:flex-row md:justify-between md:items-center">
                                    <div class="flex-1 mb-3 md:mb-0">
                                        <h4 class="font-semibold text-lg text-white flex items-center">${file.Title}${latestBadge}</h4>
                                        <div class="text-sm text-gray-400 mt-1">
                                            <span>版本: <strong class="font-medium text-gray-300">${file.Version}</strong></span> |
                                            <span>發佈日期: <strong class="font-medium text-gray-300">${file.ReleaseDate}</strong></span> |
                                            <span>檔案大小: <strong class="font-medium text-gray-300">${file.FileSize}</strong></span>
                                        </div>
                                    </div>
                                    <a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition text-center whitespace-nowrap">
                                        下載
                                    </a>
                                </div>
                            </div>`;
            }).join("");

            // 組合分類的完整 HTML (摺疊面板)
            details.innerHTML = `
                        <summary class="p-5 cursor-pointer flex justify-between items-center">
                            <div class="flex items-center">
                                <span class="font-bold text-xl text-white">${category.Name}</span>
                                <span class="ml-3 bg-gray-700 text-gray-300 text-xs font-semibold px-2.5 py-0.5 rounded-full">${category.Count} 個檔案</span>
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
            const tempAlert = document.createElement("div");
            tempAlert.textContent = "驅動程式資料尚未載入或格式不正確。";
            tempAlert.style.cssText =
                "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:red;color:white;padding:10px 20px;border-radius:8px;z-index:1000;";
            document.body.appendChild(tempAlert);
            setTimeout(() => tempAlert.remove(), 3000);
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
                const versionedFiles = fileGroup.filter(
                    (f) => !f.Version.includes("latest version")
                );

                let latestFile = null;
                if (versionedFiles.length > 0) {
                    // 如果有帶版本號的檔案，則從中找出日期最新的
                    latestFile = versionedFiles.reduce((latest, current) =>
                        new Date(current.ReleaseDate) > new Date(latest.ReleaseDate)
                            ? current
                            : latest
                    );
                } else {
                    // 否則，直接取分組中的第一個檔案
                    latestFile = fileGroup[0];
                }

                if (latestFile) {
                    const downloadUrl = latestFile.DownloadUrl.Global;
                    const fullUrl = downloadUrl.startsWith("http")
                        ? downloadUrl
                        : ASUS_BASE_URL + downloadUrl;
                    allLatestDriverUrls.push(fullUrl);
                }
            }
        });

        if (allLatestDriverUrls.length === 0) {
            const tempAlert = document.createElement("div");
            tempAlert.textContent = "找不到任何有效的驅動程式下載網址。";
            tempAlert.style.cssText =
                "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:orange;color:white;padding:10px 20px;border-radius:8px;z-index:1000;";
            document.body.appendChild(tempAlert);
            setTimeout(() => tempAlert.remove(), 3000);
            return;
        }

        const textContent = allLatestDriverUrls.join("\n");
        const blob = new Blob([textContent], {
            type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `latest_drivers_${driverData.Model.replace(
            / /g,
            "_"
        )}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});