import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export default defineConfig({
    root: 'src',
    server: {
        port: 5173,
        open: true
    },
    preview: {
        port: 4173
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            plugins: [
                {
                    name: 'copy-locales',
                    generateBundle() {
                        // 複製 locales 資料夾到 dist
                        const localesDir = join(process.cwd(), 'src', 'locales');
                        const distLocalesDir = join(process.cwd(), 'dist', 'locales');

                        if (existsSync(localesDir)) {
                            mkdirSync(distLocalesDir, { recursive: true });

                            // 複製所有 JSON 檔案
                            const fs = require('fs');
                            const files = fs.readdirSync(localesDir);
                            files.forEach(file => {
                                if (file.endsWith('.json')) {
                                    copyFileSync(
                                        join(localesDir, file),
                                        join(distLocalesDir, file)
                                    );
                                }
                            });
                        }
                    }
                }
            ]
        }
    }
});


