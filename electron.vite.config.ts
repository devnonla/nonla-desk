import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
      dedupe: ['react', 'react-dom', 'antd', 'motion'],
    },
    optimizeDeps: {
      include: ['antd', 'motion', 'motion/react'],
    },
    plugins: [react(), tailwindcss()],
  },
})
