import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { idpProxy } from './dev/idp-proxy'
const tunnelOrigin = 'https://679go8vq5053.vicp.fun'
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    allowedHosts: [new URL(tunnelOrigin).hostname],
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        xfwd: true,
      },
      '^/realms/nexus(?:/|$)': idpProxy([tunnelOrigin]),
      '/resources/': idpProxy([tunnelOrigin]),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {},
    },
  },
})
