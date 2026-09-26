import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // 状态栏版本号取自 package.json,与 tauri.conf.json 的 version 保持一致
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
  test: {
    environment: 'jsdom',
  },
})
