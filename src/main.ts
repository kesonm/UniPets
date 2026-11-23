import { createApp, type Component } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
const view = new URLSearchParams(location.search).get('view')
const admin = ['/admin', '/pet'].includes(location.pathname.replace(/\/$/, ''))
const h5 = !admin && (view==='h5' || location.pathname.endsWith('/h5') || (view!=='workbench' && matchMedia('(max-width: 680px)').matches))
const mount = ({ default: App }: { default: Component }) => {
  createApp(App).use(ElementPlus,{locale:zhCn}).mount('#app')
}

// Branch-level imports keep Vite's stylesheet dependencies with each entry page.
if (admin) {
  document.body.classList.add('admin-body')
  void import('./admin/AdminApp.vue').then(mount)
} else if (h5) {
  document.body.classList.add('h5-body')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#ffe34e')
  void import('./h5/H5App.vue').then(mount)
} else {
  void import('./App.vue').then(mount)
}
