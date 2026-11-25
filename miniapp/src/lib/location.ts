import { computed, ref } from 'vue'
import type { ServiceCoordinates } from '../../../shared/h5-discovery.mjs'
import type { District } from '../../../shared/h5-districts.mjs'
import { areaLabel } from '../../../src/h5/business'
import { api, message, toast } from './client'
import { chooseNativeLocation, district, resolveDistrictAt } from './district'

export interface MapLocation {
  point: ServiceCoordinates
  coordinates: ServiceCoordinates
  district: District
}

const key = 'petcloud.map-location.v1'
const saved = uni.getStorageSync(key) as MapLocation | 'anywhere' | ''
export const selectedLocation = ref<MapLocation | null | undefined>(saved === 'anywhere' ? null : saved || undefined)
export const browseDistrict = computed(() => selectedLocation.value === undefined ? district.value : selectedLocation.value?.district)
export const selectedLocationLabel = computed(() => areaLabel(null, selectedLocation.value?.district) || '地图选位置')

let choosing = false

function locationAction() {
  return new Promise<number | undefined>(resolve => uni.showActionSheet({
    itemList: ['重新定位', '清除位置'],
    success: result => resolve(result.tapIndex),
    fail: () => resolve(undefined),
  }))
}

export async function openMapPicker(select: (location: MapLocation | null) => void, initial?: MapLocation | null, clearable = false) {
  if (choosing) return
  choosing = true
  const origin = getCurrentPages().slice(-1)[0]
  const isActive = () => getCurrentPages().includes(origin)

  try {
    const action = clearable ? await locationAction() : 0
    if (!isActive() || action === undefined) return
    if (action === 1) return select(null)

    const place = await chooseNativeLocation(initial?.point, isActive)
    if (!isActive() || !place) return

    const point = {latitude:place.latitude, longitude:place.longitude}
    const result = await api<{coordinates: ServiceCoordinates; district: District | null}>('/h5/catalog/map-location','POST',point)
    if (!isActive()) return
    if (!result.district) throw new Error('暂未识别所选位置的区县，请重新选择。')
    select({point, coordinates:result.coordinates, district:result.district})
  } catch (cause) {
    if (isActive()) toast(message(cause))
  } finally {
    choosing = false
  }
}

export function saveBrowseLocation(location: MapLocation | null) {
  selectedLocation.value = location
  uni.setStorageSync(key, location ?? 'anywhere')
}

export async function refreshBrowseDistrict() {
  const saved = selectedLocation.value
  if (!saved?.coordinates) return
  try {
    const found = await resolveDistrictAt(saved.coordinates)
    if (selectedLocation.value === saved && found && (found.id !== saved.district.id || found.name !== saved.district.name)) {
      saveBrowseLocation({...saved,district:found})
    }
  } catch {
    // Keep a usable district when reopening the app offline.
  }
}

export function changeBrowseLocation() {
  return openMapPicker(saveBrowseLocation, selectedLocation.value, !!selectedLocation.value)
}
