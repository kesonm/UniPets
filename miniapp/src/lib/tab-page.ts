import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'

function menuInset() {
  // #ifdef MP-WEIXIN
  const menu = uni.getMenuButtonBoundingClientRect?.()
  if (menu?.bottom) return menu.bottom + 4
  const status = uni.getWindowInfo?.()?.statusBarHeight ?? 20
  return status + 44
  // #endif
  return 0
}

export function useTabPage(route: string) {
  const top = ref(menuInset())
  onShow(() => {
    top.value = menuInset()
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
  return top
}
