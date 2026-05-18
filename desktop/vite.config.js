import { defineConfig } from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  root: 'src',
  base: './',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: ['es2021', 'chrome100', 'safari13'],
  },
  server: {
    port: 1421,
    strictPort: false,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
});
