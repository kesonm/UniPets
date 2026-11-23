import { ref } from 'vue'
import { h5Areas } from '../../../shared/h5-areas.mjs'

const storageKey = 'petcloud-h5-area'
const stored = uni.getStorageSync(storageKey)
export const selectedArea = ref(h5Areas.some((area) => area.id === stored) ? stored as string : '')

export function selectArea(id: string) {
  if (id && !h5Areas.some((area) => area.id === id)) return
  selectedArea.value = id
  uni.setStorageSync(storageKey, id)
}
