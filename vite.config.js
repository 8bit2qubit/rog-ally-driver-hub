import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'path';
// 讀取 package.json 以取得版本號
import pkg from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
    // 將 'src' 資料夾設定為專案的根目錄
    // Vite 將會在這裡尋找 index.html
    root: 'src',

    // 定義全域變數，將版本號注入到客戶端程式碼中
    define: {
        'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
    },

    // 使用 viteSingleFile() 插件將所有資源內嵌到 HTML 中
    plugins: [viteSingleFile()],

    build: {
        // 因為 root 改變了，所以輸出目錄需要調整到專案的根目錄下
        outDir: resolve(__dirname, './dist'),
        // 建置前清空輸出目錄
        emptyOutDir: true,
    },
});