import { ref } from 'vue'
import { districtAt, type District, type DistrictBoundary } from '../../../shared/h5-districts.mjs'
import type { ServiceCoordinates } from '../../../shared/h5-discovery.mjs'
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

export function deviceCoordinates(type: 'wgs84'|'gcj02' = 'wgs84') {
  return new Promise<ServiceCoordinates>((resolve, reject) => uni.getLocation({
    type, success: resolve, fail: () => reject(new Error('暂时无法获取当前位置')),
  }))
}

export async function enableLocation(explanation: string) {
  if (await settings() !== false || !await confirm('开启定位', explanation)) return false
  return new Promise<boolean>(resolve => uni.openSetting({
    success: result => resolve(result.authSetting['scope.userLocation'] === true),
    fail: () => resolve(false),
  }))
}

export async function chooseNativeLocation(initial: ServiceCoordinates | null | undefined, isActive: () => boolean) {
  const choose = () => new Promise<UniNamespace.ChooseLocationSuccess | undefined>((resolve, reject) => uni.chooseLocation({
    ...initial,
    success: resolve,
    fail: ({ errMsg }) => {
      if (/cancel/i.test(errMsg)) resolve(undefined)
      else reject(new Error(errMsg || '暂时无法打开微信地图'))
    },
  }))
  try {
    return await choose()
  } catch (cause) {
    if (!isActive() || !await enableLocation('允许定位后可使用微信地图选择位置。')) throw cause
    if (isActive()) return choose()
  }
}

export async function resolveDistrictAt({latitude,longitude}: ServiceCoordinates) {
  const x = Math.floor(longitude), y = Math.floor(latitude)
  if (cached?.x !== x || cached.y !== y) {
    const {boundaries} = await api<{boundaries:DistrictBoundary[]}>('/h5/catalog/district-boundaries?x='+x+'&y='+y+'&v=2')
    cached = {x,y,boundaries}
  }
  return districtAt(latitude,longitude,cached.boundaries)
}

export async function locateDistrict(interactive = true): Promise<void> {
  if (locatingDistrict.value) return
  locatingDistrict.value = true
  try {
    const found = await resolveDistrictAt(await deviceCoordinates())
    if (!found) {
      district.value = undefined
      uni.removeStorageSync(key)
      throw new Error('暂未识别当前位置的区县')
    }
    district.value = found
    uni.setStorageSync(key, found)
  } catch (cause) {
    if (!interactive) return
    if (await enableLocation('允许定位后，首页会显示所在区县。')) {
      locatingDistrict.value = false
      return await locateDistrict()
    }
    toast(message(cause))
  } finally {
    locatingDistrict.value = false
  }
}

export async function locateIfAuthorized() {
  if (await settings() === true) await locateDistrict(false)
}
