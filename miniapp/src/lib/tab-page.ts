import { ref } from 'vue'
import { onResize, onShow } from '@dcloudio/uni-app'

function tabLayout() {
  // #ifdef MP-WEIXIN
  const metrics = uni.getWindowInfo?.()
  const width = metrics?.windowWidth || 375
  const status = metrics?.statusBarHeight ?? 20
  const frameWidth = Math.min(width, 500)
  const frameLeft = (width - frameWidth) / 2
  const frameRight = frameLeft + frameWidth
  const bounds = uni.getMenuButtonBoundingClientRect?.()
  const menu = bounds && bounds.left > 0 && bounds.right > bounds.left && bounds.bottom > bounds.top
    ? bounds
    : { left: width - 96, right: width - 8, top: status + 4, bottom: status + 36 }
  const overlaps = menu.left < frameRight && menu.right > frameLeft
  const start = overlaps ? Math.max(status + 2, menu.top - 2) : status + 4
  return {
    '--tab-start': start + 'px',
    '--tab-clearance': (overlaps ? frameRight - menu.left + 8 : 0) + 'px',
    '--tab-row-height': Math.max(40, overlaps ? menu.bottom + 6 - start : 0) + 'px',
  }
  // #endif
  return { '--tab-start': '8px', '--tab-clearance': '0px', '--tab-row-height': '40px' }
}

export function useTabPage(route: string) {
  const layout = ref(tabLayout())
  onResize(() => { layout.value = tabLayout() })
  onShow(() => {
    layout.value = tabLayout()
    // #ifdef MP-WEIXIN
    function selectTab() {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1] as {
        route?: string
        getTabBar?: () => { setData(data: { activePage: string }): void }
      } | undefined
      if (page?.route !== route) return
      const bar = page.getTabBar?.()
      bar?.setData({ activePage: route })
      return Boolean(bar)
    }
    if (!selectTab()) setTimeout(selectTab, 50)
    // #endif
  })
  return layout
}
