import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
const view = new URLSearchParams(location.search).get('view')
const h5 = view==='h5' || location.pathname.endsWith('/h5') || (view!=='workbench' && matchMedia('(max-width: 680px)').matches)
if (h5) {
  document.body.classList.add('h5-body')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#ffe34e')
}
void (h5 ? import('./h5/H5App.vue') : import('./App.vue')).then(({default:App})=>{
  createApp(App).use(ElementPlus,{locale:zhCn}).mount('#app')
})
