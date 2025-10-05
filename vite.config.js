import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    server: {
        port: 5173,
        open: true
    },
    preview: {
        port: 5173
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true
    }
});


