import { ref } from 'vue'
import { districtAt, type District, type DistrictBoundary } from '../../../shared/h5-districts.mjs'
import { api, confirm, message, toast } from './client'

const key = 'petcloud.current-district.v1'
const saved = uni.getStorageSync(key) as District | undefined
export const district = ref<District | undefined>(saved?.id && saved.name ? saved : undefined)
export const locatingDistrict = ref(false)
let cached: { x: number; y: number; boundaries: DistrictBoundary[] } | undefined

function settings() {
  return new Promise<boolean | undefined>(resolve => uni.getSetting({
    success: result => resolve(result.authSetting['scope.userLocation']),
    fail: () => resolve(undefined),
  }))
}

export async function locateDistrict(interactive = true): Promise<void> {
  if (locatingDistrict.value) return
  locatingDistrict.value = true
  try {
    const { latitude, longitude } = await new Promise<{latitude: number; longitude: number}>((resolve,reject) =>
      uni.getLocation({ type: 'wgs84', success: resolve, fail: () => reject(new Error('暂时无法获取当前位置')) }))
    const x = Math.floor(longitude), y = Math.floor(latitude)
    if (cached?.x !== x || cached.y !== y) {
      const { boundaries } = await api<{ boundaries: DistrictBoundary[] }>('/h5/catalog/district-boundaries?x=' + x + '&y=' + y)
      cached = { x, y, boundaries }
    }
    const found = districtAt(latitude, longitude, cached.boundaries)
    if (!found) {
      district.value = undefined
      uni.removeStorageSync(key)
      throw new Error('暂未识别当前位置的区县')
    }
    district.value = found
    uni.setStorageSync(key, found)
  } catch (cause) {
    if (!interactive) return
    if (await settings() === false && await confirm('开启定位', '允许定位后，首页会显示所在区县。')) {
      uni.openSetting({
        success: result => { if (result.authSetting['scope.userLocation']) void locateDistrict() },
      })
    } else toast(message(cause))
  } finally {
    locatingDistrict.value = false
  }
}

export async function locateIfAuthorized() {
  if (await settings() === true) await locateDistrict(false)
}
