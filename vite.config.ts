import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

function adminBranding(): Plugin {
  let admin = false
  return {
    name: 'petcloud-admin-branding',
    configResolved(config) {
      admin = config.base === '/pet/'
    },
    transformIndexHtml(html) {
      if (!admin) return html
      return html
        .replace(/<title>[^<]*<\/title>/, '<title>拼宠宠管理后台</title>')
        .replace(/<meta name="description" content="[^"]*"\s*\/>/, '<meta name="description" content="拼宠宠管理后台，宠物档案、门店、商品和内容管理。">')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3008', changeOrigin: true } }
  return {
    base: './', plugins: [vue(), adminBranding()],
    server: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, proxy },
  }
})
