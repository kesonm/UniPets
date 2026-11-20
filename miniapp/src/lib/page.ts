import { ref, watch } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import { message, user } from './client'

// Refresh visible pages on navigation and when the active account changes.
export function pageLoad(load: () => Promise<void>, clear?: () => void) {
  const error = ref('')
  const loading = ref(false)
  let visible = false
  let sequence = 0
  async function refresh() {
    const current = ++sequence
    error.value = ''
    loading.value = true
    try {
      await load()
    } catch (e) {
      if (current === sequence) error.value = message(e)
    } finally {
      if (current === sequence) loading.value = false
    }
  }
  watch(
    () => user.value?.id,
    () => {
      clear?.()
      if (visible) void refresh()
    },
  )
  onShow(() => {
    visible = true
    void refresh()
  })
  onHide(() => {
    visible = false
  })
  onUnload(() => {
    visible = false
    sequence++
  })
  return { refresh, loading, error }
}
export function submitAction() {
  const busy = ref(false)
  const error = ref('')
  async function run(task: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await task()
    } catch (e) {
      error.value = message(e)
    } finally {
      busy.value = false
    }
  }
  return { busy, error, run }
}
